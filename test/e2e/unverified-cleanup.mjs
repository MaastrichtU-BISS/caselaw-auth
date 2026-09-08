import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const keycloakUrl = (process.env.E2E_KEYCLOAK_URL || 'http://localhost:18080').replace(/\/$/, '')
const adminUser = process.env.KEYCLOAK_ADMIN || 'admin'
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'passwordless-e2e-admin'
const realm = process.env.KEYCLOAK_REALM || 'caselaw'
const suffix = `${Date.now()}@example.test`
const removableEmail = `abandoned-${suffix}`
const protectedEmail = `invited-${suffix}`

const token = await getAdminToken()
const removable = await createUser(token, {
  username: removableEmail,
  email: removableEmail,
  enabled: true,
  emailVerified: false,
  attributes: { 'caselaw.pending-email-otp': ['true'] },
})
const protectedUser = await createUser(token, {
  username: protectedEmail,
  email: protectedEmail,
  firstName: 'Invited',
  enabled: true,
  emailVerified: false,
})

try {
  const common = {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      KEYCLOAK_URL: keycloakUrl,
      KEYCLOAK_REALM: realm,
      KEYCLOAK_ADMIN_REALM: 'master',
      KEYCLOAK_ADMIN: adminUser,
      KEYCLOAK_ADMIN_PASSWORD: adminPassword,
    },
  }
  const dryRun = spawnSync(process.execPath, [
    'packages/caselaw-auth/bin/caselaw-auth.mjs',
    'cleanup-unverified-users',
    '--max-age-days',
    '0',
  ], common)
  assert.equal(dryRun.status, 0, `${dryRun.stdout}\n${dryRun.stderr}`)
  assert.match(dryRun.stdout, new RegExp(`WOULD DELETE ${escapeRegExp(removableEmail)}`))
  assert.doesNotMatch(dryRun.stdout, new RegExp(escapeRegExp(protectedEmail)))
  assert.equal((await userById(token, removable.id)).status, 200, 'dry run deleted a user')

  const execute = spawnSync(process.execPath, [
    'packages/caselaw-auth/bin/caselaw-auth.mjs',
    'cleanup-unverified-users',
    '--max-age-days',
    '0',
    '--execute',
  ], common)
  assert.equal(execute.status, 0, `${execute.stdout}\n${execute.stderr}`)
  assert.match(execute.stdout, new RegExp(`DELETE ${escapeRegExp(removableEmail)}`))
  assert.equal((await userById(token, removable.id)).status, 404, 'eligible user was not deleted')
  assert.equal((await userById(token, protectedUser.id)).status, 200, 'named invited user was deleted')

  console.log('PASS stale-user cleanup is dry-run by default and deletes only eligible email-only users')
} finally {
  await adminApi(token, `/users/${encodeURIComponent(removable.id)}`, { method: 'DELETE', allow404: true })
  await adminApi(token, `/users/${encodeURIComponent(protectedUser.id)}`, { method: 'DELETE', allow404: true })
}

async function getAdminToken() {
  const response = await fetch(`${keycloakUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: adminUser,
      password: adminPassword,
    }),
  })
  assert.equal(response.status, 200)
  return (await response.json()).access_token
}

async function createUser(token, user) {
  const response = await adminApi(token, '/users', { method: 'POST', body: user })
  assert.equal(response.status, 201)
  const id = response.headers.get('location')?.split('/').pop()
  assert.ok(id, 'create-user response omitted its Location header')
  return { ...user, id }
}

function userById(token, id) {
  return adminApi(token, `/users/${encodeURIComponent(id)}`, { allow404: true })
}

async function adminApi(token, suffix, options = {}) {
  const response = await fetch(`${keycloakUrl}/admin/realms/${encodeURIComponent(realm)}${suffix}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (options.allow404 && response.status === 404) return response
  assert.ok(response.ok, `admin API ${options.method || 'GET'} ${suffix} returned ${response.status}`)
  return response
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
