import { createAdminClient, envBoolean, fail } from './keycloak-admin.mjs'

const browserFlow = 'caselaw-browser-passwordless-email-first'
const formsFlow = 'Case Law email-first forms'
const methodsFlow = 'Case Law email-first methods'

try {
  const client = await createAdminClient()
  const estateMode = envBoolean('CASELAW_PASSWORDLESS_ESTATE_MODE', client.realm === 'caselaw')
  const checks = []

  for (const provider of ['caselaw-email-identity', 'ext-email-otp', 'ext-magic-form']) {
    const description = await client.api(
      'GET',
      `/authentication/config-description/${encodeURIComponent(provider)}`,
    )
    assert(description.providerId === provider, `${provider} is not installed.`)
  }
  checks.push('providers installed')

  const realm = await client.api('GET')
  assert(realm.browserFlow === browserFlow,
    `browser flow is ${realm.browserFlow || 'unset'}; expected ${browserFlow}.`)
  assert(realm.registrationAllowed === false, 'the separate password registration form is enabled.')
  assert(realm.accessCodeLifespanLogin === 600,
    `login-action timeout is ${realm.accessCodeLifespanLogin}; expected 600 seconds.`)
  const smtp = realm.smtpServer || {}
  assert(smtp.host && smtp.from, 'SMTP must have at least host and from configured in this realm.')
  checks.push('realm binding and SMTP configured')

  const profile = await client.api('GET', '/users/profile')
  for (const name of ['firstName', 'lastName']) {
    const attribute = profile.attributes?.find((candidate) => candidate.name === name)
    assert(attribute, `user profile is missing ${name}.`)
    assert(!hasActiveRequirement(attribute.required), `${name} is still required.`)
  }
  const marker = profile.attributes?.find((candidate) =>
    candidate.name === 'caselaw.pending-email-otp')
  assert(marker, 'user profile is missing the pending-user provenance marker.')
  assert(sameStringMap(marker.permissions, { view: ['admin'], edit: ['admin'] }),
    'pending-user provenance marker is not admin-only.')
  checks.push('name fields optional and cleanup provenance admin-only')

  await expectFlow(client, browserFlow, [
    ['auth-cookie', 'ALTERNATIVE', false],
    ['identity-provider-redirector', 'ALTERNATIVE', false],
    [formsFlow, 'ALTERNATIVE', true],
  ])
  await expectFlow(client, formsFlow, [
    ['caselaw-email-identity', 'REQUIRED', false],
    [methodsFlow, 'REQUIRED', true],
  ])
  const methods = await expectFlow(client, methodsFlow, [
    ['ext-email-otp', 'REQUIRED', false],
    ['ext-magic-form', 'DISABLED', false],
  ])
  await expectConfig(client, methods[0], 'caselaw-email-first-otp', {
    'ext-magic-create-nonexistent-user': 'false',
  })
  await expectConfig(client, methods[1], 'caselaw-email-first-magic-link', {
    'ext-magic-create-nonexistent-user': 'false',
    'ext-magic-update-profile-action': 'false',
    'ext-magic-update-password-action': 'false',
    'ext-magic-allow-token-reuse': 'false',
    'ext-magic-token-life-span': '600',
  })
  checks.push('OTP-only authentication flow exact; magic links disabled')

  if (estateMode) {
    const callbacks = new Map([
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
    ])
    for (const [clientId, requiredCallbacks] of callbacks) {
      const oidcClient = await findClient(client, clientId)
      assert(oidcClient, `interactive client ${clientId} is missing.`)
      assert(oidcClient.publicClient && oidcClient.standardFlowEnabled,
        `interactive client ${clientId} is not a public standard-flow client.`)
      assert(!oidcClient.directAccessGrantsEnabled && !oidcClient.serviceAccountsEnabled,
        `interactive client ${clientId} enables a disallowed grant.`)
      assert(oidcClient.attributes?.['pkce.code.challenge.method'] === 'S256',
        `interactive client ${clientId} does not require PKCE S256.`)
      assert(oidcClient.attributes?.['post.logout.redirect.uris'] === '+',
        `interactive client ${clientId} does not allow its registered logout redirects.`)
      assert(requiredCallbacks.every((callback) =>
        (oidcClient.redirectUris || []).some((registered) => redirectMatches(registered, callback))),
      `interactive client ${clientId} is missing an estate callback.`)
    }
    const machine = await findClient(client, 'caselaw-api')
    assert(machine && !machine.publicClient && !machine.standardFlowEnabled
      && machine.serviceAccountsEnabled && !machine.directAccessGrantsEnabled,
    'machine client caselaw-api is missing or browser-interactive.')
    checks.push('estate clients separated and safe')
  }

  console.log(`PASS ${client.realm} on ${client.baseUrl}: ${checks.join('; ')}.`)
  console.log('SMTP acceptance and mailbox delivery require the synthetic sign-in probe described in docs/OTP_OPERATIONS.md.')
} catch (error) {
  fail(error)
}

async function expectFlow(client, alias, expected) {
  const actual = (await client.api(
    'GET',
    `/authentication/flows/${encodeURIComponent(alias)}/executions`,
  )).filter((execution) => execution.level === 0)
  assert(actual.length === expected.length,
    `${alias} has ${actual.length} direct executions; expected ${expected.length}.`)
  expected.forEach(([identity, requirement, isFlow], index) => {
    const found = actual[index]
    assert(found.requirement === requirement, `${alias} execution ${index + 1} has the wrong requirement.`)
    assert(Boolean(found.authenticationFlow) === isFlow,
      `${alias} execution ${index + 1} has the wrong execution type.`)
    const actualIdentity = isFlow ? found.displayName : found.providerId
    assert(actualIdentity === identity,
      `${alias} execution ${index + 1} is ${actualIdentity}; expected ${identity}.`)
  })
  return actual
}

async function expectConfig(client, execution, alias, expected) {
  assert(execution.authenticationConfig, `${execution.providerId} has no configuration.`)
  const actual = await client.api(
    'GET',
    `/authentication/config/${encodeURIComponent(execution.authenticationConfig)}`,
  )
  assert(actual.alias === alias, `${execution.providerId} configuration alias is ${actual.alias}.`)
  assert(sameStringMap(actual.config, expected), `${execution.providerId} configuration has drifted.`)
}

async function findClient(client, clientId) {
  const matches = await client.api('GET', `/clients?clientId=${encodeURIComponent(clientId)}`)
  return matches.find((candidate) => candidate.clientId === clientId)
}

function hasActiveRequirement(requirement) {
  if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) return false
  return ['roles', 'scopes'].some((key) => Array.isArray(requirement[key]) && requirement[key].length > 0)
}

function sameStringMap(left = {}, right = {}) {
  const entries = (value) => Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right))
}

function redirectMatches(registered, callback) {
  const escaped = registered.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`).test(callback)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
