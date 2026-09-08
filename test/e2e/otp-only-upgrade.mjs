// Disposable local Keycloak only. Exercises both shipped installers, drift refusal
// and repeat application against the exact previously shipped two-method flow.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const base = 'http://localhost:18080'
const realm = `otp-upgrade-${process.pid}`
const t = await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST',
  body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli',
    username: process.env.KEYCLOAK_ADMIN, password: process.env.KEYCLOAK_ADMIN_PASSWORD }) })
assert.equal(t.status, 200)
const token = (await t.json()).access_token
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/admin/realms${path}`, { method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) })
  assert.ok(r.ok, `${method} ${path}: ${r.status}`)
  return r.status === 204 || r.status === 201 ? null : r.json()
}
const path = `/${realm}/authentication/flows/Case%20Law%20email-first%20methods/executions`
async function setMethods(otp, magic) {
  const methods = (await api(path)).filter(e => e.level === 0)
  for (const [index, requirement] of [otp, magic].entries()) {
    await api(path, 'PUT', { ...methods[index], requirement })
  }
}
const runNode = () => exec(process.execPath, ['packages/caselaw-auth/bin/caselaw-auth.mjs', 'apply-passwordless-flow'], {
  env: { ...process.env, KEYCLOAK_URL: base, KEYCLOAK_REALM: realm, CASELAW_PASSWORDLESS_ESTATE_MODE: 'false' } })
const runGo = () => exec('docker', ['exec', '-e', `KEYCLOAK_REALM=${realm}`, '-e', 'CASELAW_PASSWORDLESS_ESTATE_MODE=false',
  process.env.E2E_CONFIGURATOR_CONTAINER, '/opt/keycloak/bin/caselaw-passwordless-configurator'])
const config = JSON.parse(await readFile(new URL('../../realm/caselaw-realm.json', import.meta.url)))
config.realm = realm
config.clients = []
config.sslRequired = 'none'
await api('', 'POST', config)
try {
  for (const [name, run] of [['Node', runNode], ['Go', runGo]]) {
    await setMethods('ALTERNATIVE', 'ALTERNATIVE')
    await run()
    await run()
    const methods = (await api(path)).filter(e => e.level === 0)
    assert.deepEqual(methods.map(e => e.requirement), ['REQUIRED', 'DISABLED'])
    // This is not a known shipped layout; do not "repair" arbitrary admin policy.
    await setMethods('DISABLED', 'ALTERNATIVE')
    await assert.rejects(run())
    assert.deepEqual((await api(path)).filter(e => e.level === 0).map(e => e.requirement), ['DISABLED', 'ALTERNATIVE'])
    console.log(`PASS ${name}: known legacy flow migrated, repeated apply stable, custom drift preserved`)
  }
} finally {
  await api(`/${realm}`, 'DELETE')
}
