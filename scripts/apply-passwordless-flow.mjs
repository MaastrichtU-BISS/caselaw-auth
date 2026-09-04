#!/usr/bin/env node

/**
 * Install and bind the Case Law email OTP + magic-link browser flow on an
 * existing realm. Fresh realms get the same configuration from
 * realm/caselaw-realm.json; this script exists because --import-realm skips a
 * realm that already exists.
 *
 * The script is deliberately conservative. It creates the named flow when it
 * is absent, validates it when it already exists, and refuses to overwrite a
 * flow that has drifted. For the caselaw realm it also reconciles the
 * estate-specific clients by default. Set CASELAW_PASSWORDLESS_ESTATE_MODE=false
 * when applying only the generic flow to an independent realm.
 */

const baseUrl = (process.env.KEYCLOAK_URL || 'http://localhost:8080').replace(/\/$/, '')
const realm = process.env.KEYCLOAK_REALM || 'caselaw'
const adminRealm = process.env.KEYCLOAK_ADMIN_REALM || 'master'
const adminUser = process.env.KEYCLOAK_ADMIN || ''
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || ''
const estateMode = envBoolean('CASELAW_PASSWORDLESS_ESTATE_MODE', realm === 'caselaw')

const browserFlow = 'caselaw-browser-passwordless'
const formsFlow = 'Case Law passwordless forms'
const methodsFlow = 'Case Law email methods'

const otpConfig = {
  'ext-magic-create-nonexistent-user': 'false',
}

const magicLinkConfig = {
  'ext-magic-create-nonexistent-user': 'false',
  'ext-magic-update-profile-action': 'false',
  'ext-magic-update-password-action': 'false',
  'ext-magic-allow-token-reuse': 'false',
  'ext-magic-token-life-span': '600',
}

const citationsApiClient = {
  clientId: 'citations-api',
  name: 'Citations API documentation',
  description: 'Public browser client for the Citations API documentation and account UI.',
  enabled: true,
  protocol: 'openid-connect',
  publicClient: true,
  standardFlowEnabled: true,
  directAccessGrantsEnabled: false,
  serviceAccountsEnabled: false,
  redirectUris: [
    'http://localhost:3000/auth/callback',
    'https://demo-api.caselawexplorer.tech/auth/callback',
    'https://api.caselawexplorer.tech/auth/callback',
  ],
  webOrigins: [
    'http://localhost:3000',
    'https://demo-api.caselawexplorer.tech',
    'https://api.caselawexplorer.tech',
  ],
  attributes: {
    'post.logout.redirect.uris': '+',
    'pkce.code.challenge.method': 'S256',
  },
}

if (!adminUser || !adminPassword) {
  fail('Set KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD.')
}

const tokenResponse = await fetch(`${baseUrl}/realms/${encodeURIComponent(adminRealm)}/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: adminUser,
    password: adminPassword,
  }),
})

if (!tokenResponse.ok) {
  fail(`Could not get an admin token from ${baseUrl} (${tokenResponse.status}).`)
}

const { access_token: token } = await tokenResponse.json()
const adminPath = `/admin/realms/${encodeURIComponent(realm)}`
let createdFlowId = null
let createdClientId = null

try {
  await requireProvider('ext-email-otp')
  await requireProvider('ext-magic-form')

  const flows = await api('GET', `${adminPath}/authentication/flows`)
  const existing = flows.find((flow) => flow.alias === browserFlow)

  if (existing) {
    await validateExistingFlow()
    console.log(`Validated existing ${browserFlow} flow.`)
  } else {
    await api('POST', `${adminPath}/authentication/flows`, {
      alias: browserFlow,
      description: 'Browser SSO with email OTP and single-use magic-link sign-in.',
      providerId: 'basic-flow',
      topLevel: true,
      builtIn: false,
    })

    const created = (await api('GET', `${adminPath}/authentication/flows`))
      .find((flow) => flow.alias === browserFlow)
    if (!created?.id) throw new Error(`Keycloak created ${browserFlow} without returning it.`)
    createdFlowId = created.id

    await addExecution(browserFlow, 'auth-cookie', 'ALTERNATIVE')
    await addExecution(browserFlow, 'identity-provider-redirector', 'ALTERNATIVE')
    await addSubflow(browserFlow, formsFlow, 'ALTERNATIVE',
      'Collect an email address, then let the user authenticate with a code or a link.')

    await addExecution(formsFlow, 'auth-username-form', 'REQUIRED')
    await addSubflow(formsFlow, methodsFlow, 'REQUIRED',
      'Alternative passwordless methods available after the user supplies an email address.')

    const otp = await addExecution(methodsFlow, 'ext-email-otp', 'ALTERNATIVE')
    await addExecutionConfig(otp.id, 'caselaw-email-otp', otpConfig)

    const magicLink = await addExecution(methodsFlow, 'ext-magic-form', 'ALTERNATIVE')
    await addExecutionConfig(magicLink.id, 'caselaw-magic-link', magicLinkConfig)

    await validateExistingFlow()
    console.log(`Created and validated ${browserFlow}.`)
  }

  if (estateMode) {
    await ensureCitationsApiClient()
    await validateEstateClients()
  } else {
    console.log(`Skipped Case Law estate client reconciliation for realm ${realm}.`)
  }
  // The provider keeps the OTP in the authentication session, so the realm's
  // login-action timeout is its lifetime. Keep it aligned with magic links.
  await api('PUT', adminPath, { browserFlow, accessCodeLifespanLogin: 600 })

  const updatedRealm = await api('GET', adminPath)
  if (updatedRealm.browserFlow !== browserFlow) {
    throw new Error(`Browser flow binding is ${updatedRealm.browserFlow || 'unset'}, expected ${browserFlow}.`)
  }
  if (updatedRealm.accessCodeLifespanLogin !== 600) {
    throw new Error(`Login-action timeout is ${updatedRealm.accessCodeLifespanLogin}; expected 600 seconds.`)
  }

  console.log(`Bound ${browserFlow} to ${realm} on ${baseUrl}.`)
  console.log(`The realm now applies email OTP and magic-link sign-in to every interactive client in ${realm}.`)
} catch (error) {
  if (createdFlowId) {
    await api('DELETE', `${adminPath}/authentication/flows/${encodeURIComponent(createdFlowId)}`)
      .catch(() => undefined)
  }
  if (createdClientId) {
    await api('DELETE', `${adminPath}/clients/${encodeURIComponent(createdClientId)}`)
      .catch(() => undefined)
  }
  fail(error instanceof Error ? error.message : String(error))
}

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${raw || response.statusText}`)
  }
  return raw ? JSON.parse(raw) : null
}

async function requireProvider(providerId) {
  const description = await api(
    'GET',
    `${adminPath}/authentication/config-description/${encodeURIComponent(providerId)}`,
  )
  if (description.providerId !== providerId) {
    throw new Error(`${providerId} is not installed. Deploy the provider image before applying the flow.`)
  }
}

async function executions(flowAlias) {
  return (await api(
    'GET',
    `${adminPath}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`,
  )).filter((execution) => execution.level === 0)
}

async function addExecution(flowAlias, providerId, requirement) {
  await api(
    'POST',
    `${adminPath}/authentication/flows/${encodeURIComponent(flowAlias)}/executions/execution`,
    { provider: providerId },
  )
  const execution = (await executions(flowAlias)).find((item) => item.providerId === providerId)
  if (!execution) throw new Error(`Could not find ${providerId} after adding it to ${flowAlias}.`)
  await setRequirement(flowAlias, execution, requirement)
  return { ...execution, requirement }
}

async function addSubflow(parentAlias, alias, requirement, description) {
  await api(
    'POST',
    `${adminPath}/authentication/flows/${encodeURIComponent(parentAlias)}/executions/flow`,
    { alias, type: 'basic-flow', provider: 'basic-flow', description },
  )
  const execution = (await executions(parentAlias))
    .find((item) => item.authenticationFlow && item.displayName === alias)
  if (!execution) throw new Error(`Could not find ${alias} after adding it to ${parentAlias}.`)
  await setRequirement(parentAlias, execution, requirement)
}

async function setRequirement(flowAlias, execution, requirement) {
  await api(
    'PUT',
    `${adminPath}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`,
    { ...execution, requirement },
  )
}

async function addExecutionConfig(executionId, alias, config) {
  await api(
    'POST',
    `${adminPath}/authentication/executions/${encodeURIComponent(executionId)}/config`,
    { alias, config },
  )
}

async function validateExistingFlow() {
  await expectFlow(browserFlow, [
    { providerId: 'auth-cookie', requirement: 'ALTERNATIVE' },
    { providerId: 'identity-provider-redirector', requirement: 'ALTERNATIVE' },
    { displayName: formsFlow, requirement: 'ALTERNATIVE', authenticationFlow: true },
  ])
  await expectFlow(formsFlow, [
    { providerId: 'auth-username-form', requirement: 'REQUIRED' },
    { displayName: methodsFlow, requirement: 'REQUIRED', authenticationFlow: true },
  ])
  const methods = await expectFlow(methodsFlow, [
    { providerId: 'ext-email-otp', requirement: 'ALTERNATIVE' },
    { providerId: 'ext-magic-form', requirement: 'ALTERNATIVE' },
  ])
  await expectConfig(methods[0], 'caselaw-email-otp', otpConfig)
  await expectConfig(methods[1], 'caselaw-magic-link', magicLinkConfig)
}

async function expectFlow(alias, expected) {
  const actual = await executions(alias)
  if (actual.length !== expected.length) {
    throw new Error(`${alias} has ${actual.length} direct executions; expected ${expected.length}. Refusing to overwrite drift.`)
  }
  for (let index = 0; index < expected.length; index += 1) {
    const wanted = expected[index]
    const found = actual[index]
    for (const [key, value] of Object.entries(wanted)) {
      if (found[key] !== value) {
        throw new Error(`${alias} execution ${index + 1} has ${key}=${found[key]}; expected ${value}. Refusing to overwrite drift.`)
      }
    }
  }
  return actual
}

async function expectConfig(execution, alias, expected) {
  if (!execution.authenticationConfig) {
    throw new Error(`${execution.providerId} has no authenticator configuration.`)
  }
  const actual = await api(
    'GET',
    `${adminPath}/authentication/config/${encodeURIComponent(execution.authenticationConfig)}`,
  )
  if (actual.alias !== alias || !sameStringMap(actual.config, expected)) {
    throw new Error(`${execution.providerId} configuration has drifted. Refusing to overwrite it.`)
  }
}

function sameStringMap(left = {}, right = {}) {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b))
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries)
}

async function ensureCitationsApiClient() {
  const matches = await api(
    'GET',
    `${adminPath}/clients?clientId=${encodeURIComponent(citationsApiClient.clientId)}`,
  )
  if (matches.length === 0) {
    await api('POST', `${adminPath}/clients`, citationsApiClient)
    const created = await findClient(citationsApiClient.clientId)
    createdClientId = created?.id || null
    console.log('Created the public citations-api UI client.')
    return
  }

  const existing = matches[0]
  const missingRedirects = citationsApiClient.redirectUris
    .filter((uri) => !existing.redirectUris?.includes(uri))
  if (!existing.publicClient || !existing.standardFlowEnabled || existing.directAccessGrantsEnabled
      || existing.serviceAccountsEnabled || missingRedirects.length > 0) {
    throw new Error('The existing citations-api client has an unsafe or incomplete configuration. Refusing to overwrite it.')
  }
  console.log('Validated the public citations-api UI client.')
}

async function validateEstateClients() {
  const interactive = [
    ['caselaw-frontend', [
      'https://app.caselawexplorer.tech/auth/callback',
      'https://demo-app.caselawexplorer.tech/auth/callback',
    ]],
    ['caselaw-access', ['https://access.caselawexplorer.tech/auth/callback']],
    ['caselaw-db-workbench', ['https://demo-db.caselawexplorer.tech/auth/callback']],
    ['citations-api', [
      'https://demo-api.caselawexplorer.tech/auth/callback',
      'https://api.caselawexplorer.tech/auth/callback',
    ]],
  ]

  for (const [clientId, callbacks] of interactive) {
    const client = await findClient(clientId)
    if (!client) throw new Error(`Interactive Case Law client ${clientId} is missing.`)
    const attributes = client.attributes || {}
    const callbacksCovered = callbacks.every((callback) =>
      (client.redirectUris || []).some((registered) => redirectMatches(registered, callback)))
    if (!client.publicClient || !client.standardFlowEnabled || client.directAccessGrantsEnabled
        || client.serviceAccountsEnabled || attributes['pkce.code.challenge.method'] !== 'S256'
        || attributes['post.logout.redirect.uris'] !== '+' || !callbacksCovered) {
      throw new Error(`Interactive Case Law client ${clientId} is unsafe or missing a production callback.`)
    }
  }

  const machine = await findClient('caselaw-api')
  if (!machine || machine.publicClient || machine.standardFlowEnabled
      || machine.directAccessGrantsEnabled || !machine.serviceAccountsEnabled
      || (machine.redirectUris || []).length > 0) {
    throw new Error('Machine client caselaw-api is missing or has been made browser-interactive.')
  }
  console.log('Validated all Case Law interactive clients and the separate machine client.')
}

async function findClient(clientId) {
  const matches = await api(
    'GET',
    `${adminPath}/clients?clientId=${encodeURIComponent(clientId)}`,
  )
  return matches.find((client) => client.clientId === clientId) || null
}

function redirectMatches(registered, callback) {
  const escaped = registered.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`).test(callback)
}

function envBoolean(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  return ['true', '1', 'yes'].includes(raw.toLowerCase())
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
