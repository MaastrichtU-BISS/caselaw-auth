#!/usr/bin/env node
// Read-only commissioning check. No administrator credentials or dependencies.
import { pathToFileURL } from 'node:url'

export async function checkRealmDomain(input, { allowHttp = false } = {}) {
  const issuer = new URL(input)
  if (issuer.username || issuer.password || issuer.search || issuer.hash
      || !/^\/realms\/[^/]+$/.test(issuer.pathname)
      || (issuer.protocol !== 'https:' && !(allowHttp && issuer.protocol === 'http:'))) {
    throw new Error('Use a full HTTPS issuer without a trailing slash: https://auth.project.example/realms/realm-name')
  }
  const expected = issuer.href
  async function get(url, json = true) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    if (response.status !== 200) throw new Error(`${new URL(url).pathname}: HTTP ${response.status}; expected 200 without a redirect`)
    return json ? response.json() : response
  }
  const discovery = await get(`${expected}/.well-known/openid-configuration`)
  if (discovery.issuer !== expected) throw new Error(`Issuer mismatch: discovery advertises ${discovery.issuer}; expected ${expected}`)
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'userinfo_endpoint', 'end_session_endpoint', 'introspection_endpoint', 'revocation_endpoint']) {
    const endpoint = new URL(discovery[field])
    if (endpoint.origin !== issuer.origin || !endpoint.pathname.startsWith(`${issuer.pathname}/`)
        || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) {
      throw new Error(`${field} does not use the expected project origin and realm`)
    }
  }
  if (!discovery.code_challenge_methods_supported?.includes('S256')) throw new Error('Discovery does not advertise PKCE S256')
  const jwks = await get(discovery.jwks_uri)
  if (!jwks.keys?.some(key => key.kty && key.kid)) throw new Error('The realm has no published signing keys')
  await get(`${expected}/account/`, false)
  return `PASS ${expected}: canonical discovery endpoints, PKCE S256, signing keys and account page. Complete a real login to verify emails, callback, cookies and logout.`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.length !== 1) {
    console.error('Usage: node check-realm-domain.mjs https://auth.project.example/realms/realm-name')
    process.exitCode = 1
  } else {
    try { console.log(await checkRealmDomain(args[0])) }
    catch (error) { console.error(error.message); process.exitCode = 1 }
  }
}
