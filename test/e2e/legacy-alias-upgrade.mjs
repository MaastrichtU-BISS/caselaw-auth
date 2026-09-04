import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const keycloakUrl = (process.env.E2E_KEYCLOAK_URL || 'http://localhost:18080').replace(/\/$/, '')
const adminUser = process.env.KEYCLOAK_ADMIN || 'admin'
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'passwordless-e2e-admin'
const realm = process.env.KEYCLOAK_REALM || 'caselaw'
const desiredAlias = 'caselaw-browser-passwordless-email-first'
const legacyAliases = [
  'caselaw-browser-passwordless',
  'Case Law passwordless forms',
  'Case Law email methods',
]

await waitFor(`${keycloakUrl}/realms/${encodeURIComponent(realm)}/.well-known/openid-configuration`, 240_000)
const token = await getAdminToken()

for (const alias of [desiredAlias, 'Case Law email-first forms', 'Case Law email-first methods']) {
  const flow = (await flows(token)).find((candidate) => candidate.alias === alias)
  if (flow) {
    await adminApi(token, `/authentication/flows/${encodeURIComponent(flow.id)}`, { method: 'DELETE' })
  }
}

for (const alias of legacyAliases) {
  await adminApi(token, '/authentication/flows', {
    method: 'POST',
    body: {
      alias,
      description: 'Legacy alias retained by the upgrade fixture.',
      providerId: 'basic-flow',
      topLevel: true,
      builtIn: false,
    },
  })
}

const legacyOtp = await addExecution(token, legacyAliases[0], 'ext-email-otp')
await adminApi(token, `/authentication/executions/${encodeURIComponent(legacyOtp.id)}/config`, {
  method: 'POST',
  body: {
    alias: 'caselaw-email-otp',
    config: { 'ext-magic-create-nonexistent-user': 'false' },
  },
})
const legacyMagic = await addExecution(token, legacyAliases[0], 'ext-magic-form')
await adminApi(token, `/authentication/executions/${encodeURIComponent(legacyMagic.id)}/config`, {
  method: 'POST',
  body: {
    alias: 'caselaw-magic-link',
    config: {
      'ext-magic-create-nonexistent-user': 'false',
      'ext-magic-update-profile-action': 'false',
      'ext-magic-update-password-action': 'false',
      'ext-magic-allow-token-reuse': 'false',
      'ext-magic-token-life-span': '600',
    },
  },
})

const installed = spawnSync(process.execPath, ['packages/caselaw-auth/admin/apply-passwordless-flow.mjs'], {
  cwd: new URL('../..', import.meta.url),
  encoding: 'utf8',
  env: {
    ...process.env,
    KEYCLOAK_URL: keycloakUrl,
    KEYCLOAK_REALM: realm,
    KEYCLOAK_ADMIN_REALM: 'master',
    KEYCLOAK_ADMIN: adminUser,
    KEYCLOAK_ADMIN_PASSWORD: adminPassword,
    CASELAW_PASSWORDLESS_ESTATE_MODE: 'false',
  },
})
assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`)
assert.match(installed.stdout, /Bound caselaw-browser-passwordless-email-first/)

const aliasesAfter = new Set((await flows(token)).map((flow) => flow.alias))
assert.ok(aliasesAfter.has(desiredAlias), 'the new flow was not created')
for (const alias of legacyAliases) {
  assert.ok(aliasesAfter.has(alias), `the installer unexpectedly removed legacy flow ${alias}`)
}
const liveRealm = await adminApi(token, '')
assert.equal(liveRealm.browserFlow, desiredAlias)
const legacyExecutions = await executions(token, legacyAliases[0])
const legacyConfigAliases = new Set()
for (const execution of legacyExecutions.filter((candidate) => candidate.authenticationConfig)) {
  const config = await adminApi(token,
    `/authentication/config/${encodeURIComponent(execution.authenticationConfig)}`)
  legacyConfigAliases.add(config.alias)
}
for (const alias of ['caselaw-email-otp', 'caselaw-magic-link']) {
  assert.ok(legacyConfigAliases.has(alias), `legacy configuration ${alias} disappeared`)
}
console.log('PASS legacy flow and authenticator-config aliases coexist with the new email-first flow')

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
  assert.equal(response.status, 200, `admin token request returned ${response.status}`)
  return (await response.json()).access_token
}

async function flows(token) {
  return adminApi(token, '/authentication/flows')
}

async function executions(token, flowAlias) {
  return adminApi(token, `/authentication/flows/${encodeURIComponent(flowAlias)}/executions`)
}

async function addExecution(token, flowAlias, provider) {
  await adminApi(token, `/authentication/flows/${encodeURIComponent(flowAlias)}/executions/execution`, {
    method: 'POST',
    body: { provider },
  })
  const execution = (await executions(token, flowAlias))
    .find((candidate) => candidate.providerId === provider)
  assert.ok(execution, `could not create legacy ${provider} execution`)
  return execution
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
  assert.ok(response.ok, `admin API ${options.method || 'GET'} ${suffix || '/'} returned ${response.status}`)
  const raw = await response.text()
  return raw ? JSON.parse(raw) : undefined
}

async function waitFor(url, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`timed out waiting for ${url}`)
}
