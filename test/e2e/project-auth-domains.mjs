// Only invoked by run-all.sh against its disposable local Keycloak/database.
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { checkRealmDomain } from '../../scripts/check-realm-domain.mjs'

const exec = promisify(execFile)
const backend = 'http://localhost:18080'
const baseline = JSON.parse(await readFile(new URL('../../realm/caselaw-realm.json', import.meta.url)))
const tokenResponse = await fetch(`${backend}/realms/master/protocol/openid-connect/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli',
    username: process.env.KEYCLOAK_ADMIN, password: process.env.KEYCLOAK_ADMIN_PASSWORD }),
})
assert.equal(tokenResponse.status, 200)
const { access_token: adminToken } = await tokenResponse.json()
const initial = await (await fetch(`${backend}/realms/caselaw/.well-known/openid-configuration`)).json()
const realms = []
const servers = []
try {
  for (const [index, theme] of ['caselaw', 'digimach'].entries()) {
    const realm = `domain-e2e-${process.pid}-${index}`
    // A Host-aware proxy with no external DNS dependence. The distinct loopback
    // origins exercise exactly the frontendUrl override; real TLS is a rollout check.
    const server = createServer((incoming, outgoing) => {
      if (incoming.headers.host !== new URL(origin).host) { outgoing.writeHead(421).end(); return }
      const headers = { ...incoming.headers }
      for (const key of Object.keys(headers)) {
        if (key === 'forwarded' || key.startsWith('x-forwarded-')) delete headers[key]
      }
      headers['x-forwarded-host'] = new URL(origin).hostname
      headers['x-forwarded-port'] = new URL(origin).port
      headers['x-forwarded-proto'] = 'http'
      headers['x-forwarded-for'] = incoming.socket.remoteAddress
      const upstream = request(new URL(incoming.url, backend), { method: incoming.method, headers }, response => {
        outgoing.writeHead(response.statusCode, response.headers)
        response.pipe(outgoing)
      })
      upstream.on('error', () => outgoing.writeHead(502).end())
      incoming.pipe(upstream)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    const origin = `http://127.0.0.1:${server.address().port}`
    const issuer = `${origin}/realms/${realm}`
    const config = structuredClone(baseline)
    Object.assign(config, { realm, displayName: theme, loginTheme: theme, accountTheme: theme,
      sslRequired: 'none', attributes: { frontendUrl: origin } })
    await admin('/admin/realms', 'POST', config)
    realms.push(realm)
    const configured = await exec(process.execPath, ['packages/caselaw-auth/bin/caselaw-auth.mjs', 'apply-passwordless-flow'], {
      env: { ...process.env, KEYCLOAK_URL: backend, KEYCLOAK_REALM: realm,
        KEYCLOAK_ADMIN_REALM: 'master', CASELAW_PASSWORDLESS_ESTATE_MODE: 'false' },
    })
    assert.match(configured.stdout, /Bound caselaw-browser-passwordless-email-first/)
    console.log(await checkRealmDomain(issuer, { allowHttp: true }))

    // Calling the old/shared origin still advertises the canonical issuer.
    // An app that keeps its old issuer must fail a domain check, not silently migrate.
    await assert.rejects(checkRealmDomain(`${backend}/realms/${realm}`, { allowHttp: true }), /Issuer mismatch/)
    const discovery = await (await fetch(`${issuer}/.well-known/openid-configuration`, {
      headers: { 'x-forwarded-host': 'attacker.invalid', 'forwarded': 'host=attacker.invalid;proto=https' },
    })).json()
    assert.equal(discovery.issuer, issuer)

    const journey = await exec(process.execPath, ['test/e2e/passwordless-registration.mjs'], {
      env: { ...process.env, E2E_KEYCLOAK_URL: origin, E2E_ADMIN_URL: backend,
        KEYCLOAK_REALM: realm, E2E_ESTATE_MODE: 'false', E2E_VERIFY_DOMAIN: 'true' },
      timeout: 120_000,
    })
    console.log(journey.stdout.trim())
    const account = await (await fetch(`${issuer}/account/`)).text()
    const environment = JSON.parse(account.match(/<script id="environment" type="application\/json">([\s\S]*?)<\/script>/)[1])
    assert.equal(environment.authServerUrl.replace(/\/$/, ''), origin)

    // Restoring the realm setting restores the previous issuer; no global mutation.
    await admin(`/admin/realms/${realm}`, 'PUT', { attributes: { frontendUrl: '' } })
    const rollback = await (await fetch(`${issuer}/.well-known/openid-configuration`)).json()
    assert.equal(rollback.issuer, `${backend}/realms/${realm}`)
  }
  const current = await (await fetch(`${backend}/realms/caselaw/.well-known/openid-configuration`)).json()
  assert.deepEqual(current, initial, 'custom domains must not change the existing caselaw realm endpoints')
  console.log('PASS two project origins: discovery, resources, OTP-only login, disabled magic-link selection, token issuer, refresh, logout, account URLs, spoofed forwarding headers and rollback; shared realm preserved')
} finally {
  for (const realm of realms) await admin(`/admin/realms/${realm}`, 'DELETE')
  for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}

async function admin(path, method, body) {
  const response = await fetch(`${backend}${path}`, { method,
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${response.ok ? '' : await response.text()}`)
}
