/**
 * The TypeScript half of the shared conformance suite.
 *
 * Cases are loaded from ../../contract/conformance/cases.json by relative path,
 * never copied here. The Python half reads the same file. That single copy is
 * the whole anti-drift guarantee — a case inlined into one language's tests is a
 * case that stops constraining the other the moment somebody edits it.
 *
 * Runs against dist/, not src/, so it checks what actually ships. Uses node's
 * built-in test runner, so it adds no dependency.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { COOKIE_BYTE_LIMIT, createPkcePair, createServerAuth } from '../dist/server.js'

const here = dirname(fileURLToPath(import.meta.url))
const contractDir = join(here, '..', '..', 'contract')
const CASES = JSON.parse(readFileSync(join(contractDir, 'conformance', 'cases.json'), 'utf8'))
const CONTRACT = JSON.parse(readFileSync(join(contractDir, 'contract.json'), 'utf8'))

const auth = (clientId = 'conformance-client', secret = CASES.secret) =>
  createServerAuth({
    issuer: 'https://auth.example.org/realms/caselaw',
    clientId,
    redirectUri: 'https://example.org/auth/callback',
    sessionSecret: secret,
  })

const b64url = (s) => Buffer.from(s).toString('base64url')

// ── sealing ─────────────────────────────────────────────────────────────────

for (const c of CASES.seal.cases) {
  test(`seal: ${c.name}`, async () => {
    // Byte-exact, not merely round-trippable. Two implementations that each read
    // their own cookies but write different ones would pass a weaker test and
    // still be unable to hand a session to each other.
    const sealed = await auth().sealSession(c.session)
    assert.equal(sealed.split('.')[0], c.expected)
  })
}

test('seal round-trips', async () => {
  const a = auth()
  const session = {
    user: { id: 'u', email: null, name: null },
    roles: ['admin'],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  }
  assert.deepEqual(await a.unsealSession(await a.sealSession(session)), session)
})

test('seal refuses an oversized session', async () => {
  await assert.rejects(
    auth().sealSession({
      user: { id: 'u', email: null, name: null },
      roles: [],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      bloat: 'x'.repeat(COOKIE_BYTE_LIMIT),
    }),
    /over the 4096-byte/,
  )
})

// ── unsealing ───────────────────────────────────────────────────────────────

for (const c of CASES.unseal_rejects.cases) {
  test(`unseal rejects: ${c.name}`, async () => {
    assert.equal(await auth().unsealSession(c.value), null)
  })
}

test('unseal rejects undefined', async () => {
  assert.equal(await auth().unsealSession(undefined), null)
})

test('unseal rejects an expired session', async () => {
  const a = auth()
  const sealed = await a.sealSession(CASES.unseal_rejects_expired.session)
  assert.equal(await a.unsealSession(sealed), null)
})

test('unseal rejects a session signed with another secret', async () => {
  const sealed = await auth('conformance-client', 'a-different-secret').sealSession({
    user: { id: 'u', email: null, name: null },
    roles: ['admin'],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  })
  assert.equal(await auth().unsealSession(sealed), null)
})

test('unseal rejects an edited payload', async () => {
  // The attack the signature exists to stop: promote yourself by editing a role.
  const a = auth()
  const session = {
    user: { id: 'u', email: null, name: null },
    roles: ['researcher'],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  }
  const [, signature] = (await a.sealSession(session)).split('.')
  const forged = b64url(JSON.stringify({ ...session, roles: ['admin'] }))
  assert.equal(await a.unsealSession(`${forged}.${signature}`), null)
})

// ── claim mapping ───────────────────────────────────────────────────────────

for (const c of CASES.session_from_claims.cases) {
  test(`sessionFromClaims: ${c.name}`, () => {
    const session = auth(CASES.session_from_claims.clientId).sessionFromClaims(c.claims)
    assert.deepEqual(session.user, c.expected.user)
    assert.deepEqual(session.roles, c.expected.roles)
  })
}

test('session expiry is the application’s own TTL', () => {
  const session = auth().sessionFromClaims({ sub: 'u', exp: 1 })
  assert.ok(session.expiresAt > Date.now() / 1000 + 7 * 3600)
})

test('session does not carry an access token', () => {
  const session = auth().sessionFromClaims({ sub: 'u' }, { idToken: 'id-token' })
  assert.equal('accessToken' in session, false)
  assert.equal(session.idToken, 'id-token')
})

// ── PKCE and cookies ────────────────────────────────────────────────────────

test('PKCE challenge matches the pinned verifier', () => {
  const challenge = createHash('sha256').update(CASES.pkce.verifier).digest('base64url')
  assert.equal(challenge, CASES.pkce.challenge)
})

test('PKCE pair is self-consistent', async () => {
  const { verifier, challenge } = await createPkcePair()
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), challenge)
})

test('cookie options match the contract', () => {
  const options = auth().cookieOptions(3600)
  for (const [key, value] of Object.entries(CASES.cookie_options.expected)) {
    assert.equal(options[key], value)
  }
})

test('serialised cookie carries the flags', () => {
  const a = auth()
  const header = a.serializeCookie('caselaw_session', 'v', a.cookieOptions(3600))
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax']) assert.match(header, new RegExp(flag))
})

test('contract and cases agree on the byte limit', () => {
  assert.equal(CONTRACT.session_cookie.byte_limit, COOKIE_BYTE_LIMIT)
})

// ── step-up authentication ──────────────────────────────────────────────────

/* Overrides the public method rather than the private field: this suite runs
   against dist/, which is minified, so `_discovery` does not exist under that
   name there. Stubbing discover() keeps the test off the network without
   depending on how the bundle happens to be built. */
const seeded = () => {
  const a = auth()
  a.discover = async () => ({ authorization_endpoint: 'https://auth.example.org/auth' })
  return a
}

test('authorizationUrl carries max_age', async () => {
  const c = CASES.step_up.authorization_url_max_age
  const url = await seeded().authorizationUrl({ state: 's', maxAge: c.max_age })
  assert.match(url, new RegExp(c.expected_param))
})

test('authorizationUrl emits a zero max_age', async () => {
  // 0 means "authenticate now". Treating it as absent silently downgrades
  // every step-up prompt that asked for exactly that.
  const c = CASES.step_up.authorization_url_max_age
  const url = await seeded().authorizationUrl({ state: 's', maxAge: c.zero_max_age })
  assert.match(url, new RegExp(c.zero_expected_param))
})

test('authorizationUrl omits max_age when unset', async () => {
  assert.equal((await seeded().authorizationUrl({ state: 's' })).includes('max_age'), false)
})

test('session carries authTime', () => {
  const c = CASES.step_up.session_carries_auth_time
  assert.equal(auth().sessionFromClaims(c.claims).authTime, c.expected_auth_time)
})

test('session omits authTime when the claim is absent', () => {
  // Absent, not zero: authTime 0 reads as authenticated at the epoch, which a
  // freshness check treats as stale rather than as unknown.
  const session = auth().sessionFromClaims(CASES.step_up.session_omits_auth_time_when_absent.claims)
  assert.equal('authTime' in session, false)
})
