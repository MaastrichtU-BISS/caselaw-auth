import assert from 'node:assert/strict'
import test from 'node:test'
import { checkRealmDomain } from '../scripts/check-realm-domain.mjs'

const issuer = 'https://auth.project.example/realms/project'
const endpoints = {
  authorization_endpoint: 'auth', token_endpoint: 'token', jwks_uri: 'certs',
  userinfo_endpoint: 'userinfo', end_session_endpoint: 'logout',
  introspection_endpoint: 'token/introspect', revocation_endpoint: 'revoke',
}
function fixture(overrides = {}) {
  return { issuer, code_challenge_methods_supported: ['S256'],
    ...Object.fromEntries(Object.entries(endpoints).map(([key, path]) => [key, `${issuer}/protocol/openid-connect/${path}`])),
    ...overrides }
}
function mockFetch(t, discovery, status = 200) {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'manual')
    assert.ok(options.signal)
    if (String(url).endsWith('/.well-known/openid-configuration')) return Response.json(discovery, { status })
    if (String(url).endsWith('/certs')) return Response.json({ keys: [{ kty: 'RSA', kid: 'test' }] })
    if (String(url).endsWith('/account/')) return new Response('<html></html>')
    throw new Error('Unexpected request')
  })
}
test('domain checker accepts canonical project endpoints without admin credentials', async t => {
  mockFetch(t, fixture())
  assert.match(await checkRealmDomain(issuer), /^PASS /)
})
test('domain checker rejects an old issuer after a realm hostname migration', async t => {
  mockFetch(t, fixture({ issuer: 'https://old.example/realms/project' }))
  await assert.rejects(checkRealmDomain(issuer), /Issuer mismatch/)
})
test('domain checker rejects a token endpoint that leaks to another host or realm', async t => {
  for (const token_endpoint of ['https://old.example/realms/project/token', 'https://auth.project.example/realms/other/token']) {
    mockFetch(t, fixture({ token_endpoint }))
    await assert.rejects(checkRealmDomain(issuer), /token_endpoint/)
    t.mock.restoreAll()
  }
})
test('domain checker rejects redirect aliases instead of following them', async t => {
  mockFetch(t, fixture(), 302)
  await assert.rejects(checkRealmDomain(issuer), /HTTP 302/)
})
test('domain checker requires an HTTPS issuer with no credentials or ambiguous suffix', async () => {
  for (const candidate of ['http://auth.project.example/realms/project', `${issuer}/`, `${issuer}?x=1`,
    'https://user:password@auth.project.example/realms/project', 'https://auth.project.example']) {
    await assert.rejects(checkRealmDomain(candidate), /full HTTPS issuer/)
  }
})
