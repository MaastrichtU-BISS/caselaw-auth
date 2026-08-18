/**
 * The server half of the client in `client.ts`.
 *
 * Some things cannot be done from a browser at all. Anything holding a shared
 * secret is the clear case — DiscourseConnect signs its payload with one, so a
 * browser implementation is not weaker, it is impossible. Server-rendered apps
 * are the other: there is no `window` to put a session in.
 *
 * This is that path. The browser client keeps its session in `localStorage`,
 * where script on the page can read it; this one keeps nothing in the browser
 * but an httpOnly cookie, which script cannot read at all.
 *
 * Framework-neutral and dependency-free, on Web Crypto and `fetch` only, so it
 * runs on Node 18+, Astro's node and serverless adapters, Deno and workers.
 * Nothing here imports a router, and nothing here reads `process.env` — pass
 * configuration in, so the same code can be tested without one.
 *
 * The shape is deliberately close to `sql-runner-ui/server.js` in
 * caselaw-coolify, which is where it was proven; the decisions that file
 * arrived at the hard way are carried over and noted at each one.
 */

import type { OidcDiscovery, TokenResponse } from './types'

export interface ServerAuthConfig {
  issuer: string
  clientId: string
  /** Confidential clients only. Never reachable from a browser. */
  clientSecret?: string
  redirectUri: string
  scope?: string
  /**
   * Signs the session cookie. Any long random string, and not shared with
   * anything else — whoever holds it can mint a session for any user.
   */
  sessionSecret: string
  /**
   * How long a sign-in lasts, in seconds. This is the application's own
   * session, deliberately not the access token's lifetime: the access token is
   * measured in minutes and is not kept (see `SessionRecord`), and reading the
   * expiry off a token makes session length hostage to clock drift between two
   * machines. Default 8 hours.
   */
  sessionTtlSeconds?: number
  /** Seconds a JWKS response is reused. Default 300. */
  jwksCacheSeconds?: number
}

/**
 * What goes in the cookie.
 *
 * Note what is absent: the access token. sql-runner-ui stored one until it
 * was measured — it bloated the cookie past the browser's limit (see
 * `sealSession`) and bought nothing, because the roles are copied out here and
 * nothing downstream reads the token. Keep it only if something genuinely
 * calls an API as the user; a token in a cookie is a token that leaks with the
 * cookie.
 *
 * The id token stays, because single sign-out wants it as `id_token_hint`.
 */
export interface SessionRecord {
  user: { id: string; email: string | null; name: string | null }
  roles: string[]
  expiresAt: number
  idToken?: string
  [key: string]: unknown
}

export interface JwtClaims {
  sub: string
  iss: string
  aud?: string | string[]
  exp: number
  iat?: number
  nbf?: number
  azp?: string
  email?: string
  name?: string
  preferred_username?: string
  realm_access?: { roles?: string[] }
  resource_access?: Record<string, { roles?: string[] }>
  [claim: string]: unknown
}

const DEFAULT_SCOPE = 'openid profile email'
const DEFAULT_SESSION_TTL = 8 * 3600
const DEFAULT_JWKS_CACHE = 300

/** Browsers cap one cookie at 4096 bytes and drop anything larger in silence. */
export const COOKIE_BYTE_LIMIT = 4096

const encoder = new TextEncoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Backed by an explicit ArrayBuffer rather than Uint8Array.from, whose
// ArrayBufferLike could in principle be a SharedArrayBuffer and so is not
// assignable to the BufferSource that Web Crypto takes.
function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/** URL-safe random string, for `state` and PKCE verifiers. */
export function randomToken(bytes = 32): string {
  return base64UrlEncode(randomBytes(bytes))
}

/**
 * PKCE is not only for public clients. A confidential client that also sends a
 * challenge is protected even if its secret leaks, and Keycloak clients in this
 * realm are configured to require S256, so a server flow without it is refused.
 */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(64)
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier))
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) }
}

/** Constant-time compare, so a signature cannot be guessed a byte at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let differing = 0
  for (let index = 0; index < a.length; index += 1) {
    differing |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return differing === 0
}

const RSA_HASHES: Record<string, string> = { RS256: 'SHA-256', RS384: 'SHA-384', RS512: 'SHA-512' }
const EC_CURVES: Record<string, { namedCurve: string; hash: string }> = {
  ES256: { namedCurve: 'P-256', hash: 'SHA-256' },
  ES384: { namedCurve: 'P-384', hash: 'SHA-384' },
}

export class ServerAuth {
  private readonly config: Required<Omit<ServerAuthConfig, 'clientSecret'>> & { clientSecret?: string }
  private discovery: { value: OidcDiscovery; fetchedAt: number } | null = null
  private jwks: { keys: JsonWebKey[]; fetchedAt: number } | null = null
  private hmacKey: Promise<CryptoKey> | null = null

  constructor(config: ServerAuthConfig) {
    if (!config.issuer) throw new Error('caselaw-auth/server: issuer is required')
    if (!config.sessionSecret) throw new Error('caselaw-auth/server: sessionSecret is required')
    this.config = {
      scope: DEFAULT_SCOPE,
      sessionTtlSeconds: DEFAULT_SESSION_TTL,
      jwksCacheSeconds: DEFAULT_JWKS_CACHE,
      ...config,
      issuer: config.issuer.replace(/\/$/, ''),
    }
  }

  async discover(): Promise<OidcDiscovery> {
    if (this.discovery) return this.discovery.value
    const response = await fetch(`${this.config.issuer}/.well-known/openid-configuration`)
    if (!response.ok) {
      throw new Error(`caselaw-auth/server: discovery failed with ${response.status}`)
    }
    const value = (await response.json()) as OidcDiscovery
    this.discovery = { value, fetchedAt: Date.now() }
    return value
  }

  /** Where to send the browser to start a sign-in. */
  async authorizationUrl(options: {
    state: string
    codeChallenge?: string
    nonce?: string
    prompt?: 'login' | 'none' | 'consent' | 'select_account'
    loginHint?: string
    /**
     * Seconds since the user last authenticated, beyond which the provider must
     * ask again. This is what step-up authentication is built on: a privileged
     * action sends a small max_age, and the returned token's auth_time proves
     * the person was actually present rather than a session being replayed.
     *
     * Prefer this to `prompt: 'login'`, which re-prompts even someone who
     * signed in a second ago.
     */
    maxAge?: number
  }): Promise<string> {
    const discovery = await this.discover()
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      state: options.state,
    })
    if (options.codeChallenge) {
      params.set('code_challenge', options.codeChallenge)
      params.set('code_challenge_method', 'S256')
    }
    if (options.nonce) params.set('nonce', options.nonce)
    if (options.prompt) params.set('prompt', options.prompt)
    if (options.loginHint) params.set('login_hint', options.loginHint)
    // 0 is meaningful — "authenticate now, whatever happened before".
    if (options.maxAge !== undefined) params.set('max_age', String(options.maxAge))
    return `${discovery.authorization_endpoint}?${params.toString()}`
  }

  /** Redeems the authorization code. Server-side, so the secret stays here. */
  async exchangeCode(options: { code: string; codeVerifier?: string }): Promise<TokenResponse> {
    const discovery = await this.discover()
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: options.code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
    })
    if (options.codeVerifier) body.set('code_verifier', options.codeVerifier)
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret)

    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) {
      // The body carries `error_description`, which is the difference between
      // "redirect URI does not match" and "client secret is wrong" — both of
      // which otherwise arrive as an opaque 400.
      throw new Error(`caselaw-auth/server: token exchange failed with ${response.status}: ${await response.text()}`)
    }
    return (await response.json()) as TokenResponse
  }

  private async signingKeys(force = false): Promise<JsonWebKey[]> {
    const fresh = this.jwks && Date.now() - this.jwks.fetchedAt < this.config.jwksCacheSeconds * 1000
    if (fresh && !force) return this.jwks!.keys
    const discovery = await this.discover()
    const url = (discovery as { jwks_uri?: string }).jwks_uri
      || `${this.config.issuer}/protocol/openid-connect/certs`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`caselaw-auth/server: JWKS fetch failed with ${response.status}`)
    const { keys } = (await response.json()) as { keys: JsonWebKey[] }
    this.jwks = { keys, fetchedAt: Date.now() }
    return keys
  }

  /**
   * Verifies a token's signature and claims against the realm.
   *
   * Offline against the cached key set, so this is not a network call per
   * request. It retries once against a freshly fetched set, because the cache
   * expires and a single blip on the refetch would otherwise fail a request
   * that has nothing wrong with it — the access service learned that one by
   * turning a filled-in form into a bare 503.
   *
   * `audience` is off by default on purpose. Keycloak does not put the client
   * id in `aud` for a public client's access token; it puts `account` and
   * names the client in `azp`. Checking `aud` therefore rejects every valid
   * token, which reads as the tokens being broken. Use `azp` instead.
   */
  async verifyToken(token: string, options: { audience?: string; azp?: string; nonce?: string } = {}): Promise<JwtClaims> {
    let lastError: unknown = null
    for (const force of [false, true]) {
      try {
        return await this.verifyOnce(token, options, force)
      } catch (error) {
        // A malformed or expired token says the same thing on a second pass.
        if ((error as Error).name === 'TokenInvalid') throw error
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('caselaw-auth/server: token verification failed')
  }

  private async verifyOnce(token: string, options: { audience?: string; azp?: string; nonce?: string }, force: boolean): Promise<JwtClaims> {
    const invalid = (message: string) => {
      const error = new Error(`caselaw-auth/server: ${message}`)
      error.name = 'TokenInvalid'
      return error
    }

    const parts = token.split('.')
    if (parts.length !== 3) throw invalid('token is not a JWT')
    const [headerPart, payloadPart, signaturePart] = parts

    let header: { alg?: string; kid?: string }
    let claims: JwtClaims
    try {
      header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerPart)))
      claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)))
    } catch {
      throw invalid('token is not decodable')
    }

    const alg = header.alg || ''
    if (!RSA_HASHES[alg] && !EC_CURVES[alg]) throw invalid(`unsupported algorithm ${alg || '(none)'}`)

    const keys = await this.signingKeys(force)
    const jwk = keys.find((candidate) => (candidate as { kid?: string }).kid === header.kid) || keys[0]
    if (!jwk) throw new Error('caselaw-auth/server: no signing keys published')

    const algorithm = RSA_HASHES[alg]
      ? { name: 'RSASSA-PKCS1-v1_5', hash: RSA_HASHES[alg] }
      : { name: 'ECDSA', namedCurve: EC_CURVES[alg].namedCurve }
    const key = await crypto.subtle.importKey('jwk', { ...jwk, alg, ext: true }, algorithm, false, ['verify'])

    const verified = await crypto.subtle.verify(
      RSA_HASHES[alg] ? algorithm : { name: 'ECDSA', hash: EC_CURVES[alg].hash },
      key,
      base64UrlDecode(signaturePart),
      encoder.encode(`${headerPart}.${payloadPart}`),
    )
    if (!verified) throw invalid('signature does not verify')

    const now = Math.floor(Date.now() / 1000)
    if (typeof claims.exp === 'number' && claims.exp <= now) throw invalid('token has expired')
    if (typeof claims.nbf === 'number' && claims.nbf > now + 60) throw invalid('token is not yet valid')
    if (claims.iss !== this.config.issuer) throw invalid('token was issued by a different realm')
    if (options.audience) {
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
      if (!audiences.includes(options.audience)) throw invalid('token is for a different audience')
    }
    if (options.azp && claims.azp !== options.azp) throw invalid('token was issued to a different client')
    if (options.nonce && claims.nonce !== options.nonce) throw invalid('nonce does not match')
    return claims
  }

  /** Realm roles plus this client's roles, flattened the way the browser client does. */
  rolesFromClaims(claims: JwtClaims): string[] {
    const realm = claims.realm_access?.roles || []
    const client = claims.resource_access?.[this.config.clientId]?.roles || []
    return [...new Set([...realm, ...client])]
  }

  /** Builds the session a callback route should store, from verified claims. */
  sessionFromClaims(claims: JwtClaims, options: { idToken?: string } = {}): SessionRecord {
    return {
      user: {
        id: String(claims.sub),
        email: claims.email || claims.preferred_username || null,
        name: claims.name || claims.preferred_username || null,
      },
      roles: this.rolesFromClaims(claims),
      expiresAt: Math.floor(Date.now() / 1000) + this.config.sessionTtlSeconds,
      // When the person last actually authenticated, as the provider reports
      // it -- not when this session was created. A session refreshed for eight
      // hours keeps its original authTime, which is exactly what makes it
      // usable for deciding whether to ask again before something destructive.
      ...(claims.auth_time !== undefined ? { authTime: Number(claims.auth_time) } : {}),
      ...(options.idToken ? { idToken: options.idToken } : {}),
    }
  }

  private signingKey(): Promise<CryptoKey> {
    if (!this.hmacKey) {
      this.hmacKey = crypto.subtle.importKey(
        'raw',
        encoder.encode(this.config.sessionSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
    }
    return this.hmacKey
  }

  /**
   * Signs a session into a cookie value.
   *
   * Signed, not encrypted: the contents are the user's own identity, which they
   * already know. What matters is that they cannot change it — an unsigned
   * cookie lets anyone promote themselves by editing a role.
   *
   * Throws above the browser's 4096-byte cap rather than returning something
   * the browser will drop. A dropped cookie presents as the application
   * signing the user straight back out, which reads as broken auth rather than
   * an oversized session, and cost a real debugging session in the workbench.
   */
  async sealSession(session: SessionRecord, cookieName = 'caselaw_session'): Promise<string> {
    const payload = base64UrlEncode(encoder.encode(JSON.stringify(session)))
    const signature = base64UrlEncode(
      new Uint8Array(await crypto.subtle.sign('HMAC', await this.signingKey(), encoder.encode(payload))),
    )
    const value = `${payload}.${signature}`
    const size = new TextEncoder().encode(`${cookieName}=${value}`).length
    if (size > COOKIE_BYTE_LIMIT) {
      throw new Error(
        `caselaw-auth/server: session cookie is ${size} bytes, over the ${COOKIE_BYTE_LIMIT}-byte browser limit. `
        + 'Something oversized is in the session — an access token is the usual culprit.',
      )
    }
    return value
  }

  /** Verifies and decodes a cookie value. Returns null for anything untrusted or expired. */
  async unsealSession(value: string | undefined | null): Promise<SessionRecord | null> {
    if (!value) return null
    const [payload, signature] = value.split('.')
    if (!payload || !signature) return null

    const expected = base64UrlEncode(
      new Uint8Array(await crypto.subtle.sign('HMAC', await this.signingKey(), encoder.encode(payload))),
    )
    if (!timingSafeEqual(signature, expected)) return null

    try {
      const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as SessionRecord
      if (!session?.user?.id || typeof session.expiresAt !== 'number') return null
      if (session.expiresAt * 1000 <= Date.now()) return null
      return session
    } catch {
      return null
    }
  }

  /**
   * Attributes for the session cookie.
   *
   * `httpOnly` is the whole point: script on the page cannot read it, so an
   * XSS that would walk off with a `localStorage` session gets nothing here.
   * `sameSite: 'lax'` still allows the top-level redirect back from the
   * identity provider, which `strict` would drop — leaving the user signed in
   * everywhere except the page they just landed on.
   */
  cookieOptions(maxAgeSeconds: number, options: { secure?: boolean; path?: string } = {}) {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: options.secure ?? true,
      path: options.path ?? '/',
      maxAge: Math.max(0, maxAgeSeconds),
    }
  }

  /** Serialises a cookie for a `Set-Cookie` header, for runtimes without a helper. */
  serializeCookie(name: string, value: string, options: ReturnType<ServerAuth['cookieOptions']>): string {
    const parts = [`${name}=${value}`, `Path=${options.path}`, `Max-Age=${options.maxAge}`, `SameSite=Lax`]
    if (options.httpOnly) parts.push('HttpOnly')
    if (options.secure) parts.push('Secure')
    return parts.join('; ')
  }

  /**
   * Where to send the browser to sign out.
   *
   * Passing `id_token_hint` is what makes this a real single sign-out rather
   * than only dropping the local cookie: without it Keycloak keeps its own
   * session, and the next sign-in completes with no prompt, which looks like
   * the sign-out silently failed.
   */
  async endSessionUrl(options: { idToken?: string; returnTo?: string }): Promise<string> {
    const discovery = await this.discover()
    if (!discovery.end_session_endpoint) return options.returnTo || '/'
    const params = new URLSearchParams()
    if (options.idToken) params.set('id_token_hint', options.idToken)
    if (options.returnTo) params.set('post_logout_redirect_uri', options.returnTo)
    if (!options.idToken && options.returnTo) params.set('client_id', this.config.clientId)
    return `${discovery.end_session_endpoint}?${params.toString()}`
  }
}

export function createServerAuth(config: ServerAuthConfig): ServerAuth {
  return new ServerAuth(config)
}
