import type {
  AuthConfig,
  AuthSession,
  AuthUser,
  LoginOptions,
  OidcDiscovery,
  TokenResponse,
} from './types'

interface LoginState {
  verifier: string
  returnTo: string
  createdAt: number
}

const defaultScope = 'openid profile email'
const defaultStorageKey = 'caselaw:auth'

export class OidcAuthClient {
  private readonly config: Required<Pick<AuthConfig, 'scope' | 'storageKey' | 'refreshSkewSeconds'>> & AuthConfig
  private discoveryPromise: Promise<OidcDiscovery> | null = null

  constructor(config: AuthConfig) {
    this.config = {
      scope: defaultScope,
      storageKey: defaultStorageKey,
      refreshSkewSeconds: 45,
      ...config,
      issuer: stripTrailingSlash(config.issuer),
    }
  }

  async login(options: LoginOptions = {}): Promise<void> {
    assertBrowser()

    const discovery = await this.discover()
    const verifier = randomString(64)
    const challenge = await createCodeChallenge(verifier)
    const state = randomString(32)
    const nonce = randomString(32)
    const returnTo = options.returnTo || `${window.location.pathname}${window.location.search}${window.location.hash}`

    this.clearLoginState()
    const stateKey = this.loginStateKey(state)
    const loginState = JSON.stringify({ verifier, returnTo, createdAt: Date.now() } satisfies LoginState)
    window.sessionStorage.setItem(stateKey, loginState)
    window.localStorage.setItem(stateKey, loginState)

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })

    if (options.prompt) params.set('prompt', options.prompt)
    if (options.loginHint) params.set('login_hint', options.loginHint)

    window.location.assign(`${discovery.authorization_endpoint}?${params.toString()}`)
  }

  async handleCallback(callbackUrl = window.location.href): Promise<AuthSession> {
    assertBrowser()

    const url = new URL(callbackUrl)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      throw new Error(url.searchParams.get('error_description') || error)
    }
    if (!code || !state) {
      throw new Error('Missing OIDC callback code or state.')
    }

    const stateKey = this.loginStateKey(state)
    const stored = window.sessionStorage.getItem(stateKey) || window.localStorage.getItem(stateKey)
    window.sessionStorage.removeItem(stateKey)
    window.localStorage.removeItem(stateKey)

    if (!stored) {
      this.clearLoginState()
      throw new Error('OIDC callback state was not found. Start login again.')
    }

    const loginState = JSON.parse(stored) as LoginState
    const discovery = await this.discover()
    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        code,
        code_verifier: loginState.verifier,
      }),
    })

    const tokenResponse = await readTokenResponse(response)
    const session = this.createSession(tokenResponse)
    this.setSession(session)
    this.clearLoginState()

    const target = loginState.returnTo && loginState.returnTo !== '/auth/callback' ? loginState.returnTo : '/'
    window.history.replaceState({}, document.title, target)
    return session
  }

  async refresh(): Promise<AuthSession | null> {
    const current = this.getSession()
    if (!current?.refreshToken) return current

    const discovery = await this.discover()
    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        refresh_token: current.refreshToken,
      }),
    })

    if (!response.ok) {
      this.clearSession()
      return null
    }

    const tokenResponse = await readTokenResponse(response)
    const session = this.createSession({
      ...tokenResponse,
      refresh_token: tokenResponse.refresh_token || current.refreshToken,
    })
    this.setSession(session)
    return session
  }

  /**
   * Sign out here and at the identity provider.
   *
   * The whole destination is worked out before any state is torn down, and
   * nothing is awaited afterwards. That ordering is the fix for a race that
   * made the first sign-out of a page load silently fail: discovery is a
   * network round trip, and while it was in flight the application had
   * already been told it was signed out, so its own route guard sent the
   * browser to the authorize endpoint. The SSO cookie at the provider was
   * still valid, so that came straight back with a fresh session and the
   * logout redirect never ran. It appeared to work on the second attempt only
   * because discovery was memoised by then and won the race.
   */
  async logout(returnTo = this.config.postLogoutRedirectUri || '/'): Promise<void> {
    assertBrowser()

    const session = this.getSession()
    const discovery = await this.discover().catch(() => null)

    let destination = returnTo
    if (discovery?.end_session_endpoint) {
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        post_logout_redirect_uri: absoluteUrl(returnTo),
      })
      // Without this Keycloak cannot tell which session to end, and answers
      // with a confirmation page instead of ending it.
      if (session?.idToken) params.set('id_token_hint', session.idToken)
      destination = `${discovery.end_session_endpoint}?${params.toString()}`
    }

    this.clearSession()
    window.location.assign(destination)
  }

  getSession(): AuthSession | null {
    if (!isBrowser()) return null

    const raw = window.localStorage.getItem(this.config.storageKey)
    if (!raw) return null

    try {
      return JSON.parse(raw) as AuthSession
    } catch {
      this.clearSession()
      return null
    }
  }

  setSession(session: AuthSession): void {
    assertBrowser()
    window.localStorage.setItem(this.config.storageKey, JSON.stringify(session))
  }

  clearSession(): void {
    if (!isBrowser()) return
    window.localStorage.removeItem(this.config.storageKey)
    this.clearLoginState()
  }

  shouldRefresh(session: AuthSession | null = this.getSession()): boolean {
    if (!session) return false
    return session.expiresAt - Date.now() < this.config.refreshSkewSeconds * 1000
  }

  hasRole(role: string, session: AuthSession | null = this.getSession()): boolean {
    return Boolean(session?.user.roles.includes(role))
  }

  hasAnyRole(roles: string[], session: AuthSession | null = this.getSession()): boolean {
    if (roles.length === 0) return true
    return roles.some((role) => this.hasRole(role, session))
  }

  async discover(): Promise<OidcDiscovery> {
    if (!this.discoveryPromise) {
      this.discoveryPromise = fetch(`${this.config.issuer}/.well-known/openid-configuration`)
        .then(async (response) => {
          if (!response.ok) throw new Error(`Could not load OIDC discovery from ${this.config.issuer}.`)
          return (await response.json()) as OidcDiscovery
        })
    }
    return this.discoveryPromise
  }

  private createSession(response: TokenResponse): AuthSession {
    const token = response.access_token ?? response.id_token
    if (!token) throw new Error('OIDC token response did not include a JWT.')
    const claims = decodeJwtPayload(token)
    const expiresAt = Date.now() + Math.max(response.expires_in || 300, 1) * 1000

    return {
      accessToken: response.access_token,
      idToken: response.id_token,
      refreshToken: response.refresh_token,
      tokenType: response.token_type || 'Bearer',
      expiresAt,
      scope: response.scope,
      user: claimsToUser(claims, this.config.clientId),
    }
  }

  private loginStateKey(state: string): string {
    return `${this.config.storageKey}:state:${state}`
  }

  private loginStatePrefix(): string {
    return `${this.config.storageKey}:state:`
  }

  private clearLoginState(): void {
    if (!isBrowser()) return
    const prefix = this.loginStatePrefix()
    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (let i = storage.length - 1; i >= 0; i -= 1) {
        const key = storage.key(i)
        if (key?.startsWith(prefix)) storage.removeItem(key)
      }
    }
  }
}

export function createAuthClient(config: AuthConfig): OidcAuthClient {
  return new OidcAuthClient(config)
}

function claimsToUser(claims: Record<string, unknown>, clientId: string): AuthUser {
  const realmRoles = readStringArray(readRecord(claims.realm_access)?.roles)
  const resourceAccess = readRecord(claims.resource_access)
  const clientRoles: Record<string, string[]> = {}

  for (const [resource, access] of Object.entries(resourceAccess || {})) {
    clientRoles[resource] = readStringArray(readRecord(access)?.roles)
  }

  const roles = Array.from(new Set([...realmRoles, ...(clientRoles[clientId] || [])]))

  return {
    sub: String(claims.sub || ''),
    email: readString(claims.email),
    emailVerified: typeof claims.email_verified === 'boolean' ? claims.email_verified : undefined,
    name: readString(claims.name),
    preferredUsername: readString(claims.preferred_username),
    givenName: readString(claims.given_name),
    familyName: readString(claims.family_name),
    roles,
    clientRoles,
    claims,
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.')
  if (!payload) throw new Error('Token is not a JWT.')

  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  return JSON.parse(decodeURIComponent(Array.from(decoded, (char) => {
    return `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
  }).join(''))) as Record<string, unknown>
}

async function readTokenResponse(response: Response): Promise<TokenResponse> {
  if (response.ok) return await response.json() as TokenResponse

  let detail = response.statusText
  try {
    const body = await response.json() as { error_description?: string; error?: string }
    detail = body.error_description || body.error || detail
  } catch {
    // Keep the HTTP status text if the provider did not return JSON.
  }
  throw new Error(`OIDC token request failed: ${detail}`)
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return base64UrlEncode(new Uint8Array(digest))
}

function randomString(size: number): string {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function absoluteUrl(value: string): string {
  if (/^https?:\/\//.test(value)) return value
  return new URL(value, window.location.origin).toString()
}

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function assertBrowser(): void {
  if (!isBrowser()) throw new Error('OIDC browser auth can only run in a browser.')
}
