import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const realm = JSON.parse(await readFile(new URL('../realm/caselaw-realm.json', import.meta.url)))
const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')
const compose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8')
const entrypoint = await readFile(new URL('../scripts/keycloak-entrypoint.sh', import.meta.url), 'utf8')
const nodeConfigurator = await readFile(new URL('../packages/caselaw-auth/admin/apply-passwordless-flow.mjs', import.meta.url), 'utf8')
const goConfigurator = await readFile(new URL('../scripts/passwordless-configurator/main.go', import.meta.url), 'utf8')

function flow(alias) {
  const found = realm.authenticationFlows.find((item) => item.alias === alias)
  assert.ok(found, `missing authentication flow ${alias}`)
  return found
}

function execution(parent, providerOrFlow) {
  const found = parent.authenticationExecutions.find((item) =>
    item.authenticator === providerOrFlow || item.flowAlias === providerOrFlow)
  assert.ok(found, `missing ${providerOrFlow} in ${parent.alias}`)
  return found
}

function client(clientId) {
  const found = realm.clients.find((item) => item.clientId === clientId)
  assert.ok(found, `missing client ${clientId}`)
  return found
}

test('the realm defaults to password login and includes an opt-in passwordless flow', () => {
  assert.equal(realm.browserFlow, 'browser')
  assert.equal(realm.accessCodeLifespanLogin, 600)

  const browser = flow('caselaw-browser-passwordless-email-first')
  assert.equal(execution(browser, 'auth-cookie').requirement, 'ALTERNATIVE')
  assert.equal(execution(browser, 'identity-provider-redirector').requirement, 'ALTERNATIVE')
  assert.equal(execution(browser, 'Case Law email-first forms').requirement, 'ALTERNATIVE')

  const forms = flow('Case Law email-first forms')
  assert.equal(execution(forms, 'caselaw-email-identity').requirement, 'REQUIRED')
  assert.equal(execution(forms, 'Case Law email-first methods').requirement, 'REQUIRED')

  const methods = flow('Case Law email-first methods')
  assert.equal(execution(methods, 'ext-email-otp').requirement, 'ALTERNATIVE')
  assert.equal(execution(methods, 'ext-magic-form').requirement, 'ALTERNATIVE')
})

test('email identity creates passwordless users and email methods verify them', () => {
  assert.equal(realm.registrationAllowed, false)
  const byAlias = Object.fromEntries(realm.authenticatorConfig.map((item) => [item.alias, item.config]))
  assert.deepEqual(byAlias['caselaw-email-first-otp'], {
    'ext-magic-create-nonexistent-user': 'false',
  })
  assert.deepEqual(byAlias['caselaw-email-first-magic-link'], {
    'ext-magic-create-nonexistent-user': 'false',
    'ext-magic-update-profile-action': 'false',
    'ext-magic-update-password-action': 'false',
    'ext-magic-allow-token-reuse': 'false',
    'ext-magic-token-life-span': '600',
  })
})

test('every interactive estate client uses standard flow with PKCE', () => {
  for (const clientId of ['caselaw-frontend', 'caselaw-access', 'caselaw-db-workbench', 'citations-api']) {
    const interactive = client(clientId)
    assert.equal(interactive.publicClient, true, clientId)
    assert.equal(interactive.standardFlowEnabled, true, clientId)
    assert.equal(interactive.directAccessGrantsEnabled, false, clientId)
    assert.equal(interactive.serviceAccountsEnabled, false, clientId)
    assert.equal(interactive.attributes['pkce.code.challenge.method'], 'S256', clientId)
    assert.equal(interactive.attributes['post.logout.redirect.uris'], '+', clientId)
  }
})

test('the browser-facing API UI is separate from the machine API client', () => {
  const browserApi = client('citations-api')
  assert.ok(browserApi.redirectUris.includes('https://demo-api.caselawexplorer.tech/auth/callback'))

  const machineApi = client('caselaw-api')
  assert.equal(machineApi.publicClient, false)
  assert.equal(machineApi.standardFlowEnabled, false)
  assert.equal(machineApi.directAccessGrantsEnabled, false)
  assert.equal(machineApi.serviceAccountsEnabled, true)
  assert.deepEqual(machineApi.redirectUris ?? [], [])
})

test('the production image keeps passwordless reconciliation opt-in and non-fatal', () => {
  assert.match(dockerfile, /caselaw-passwordless-configurator/)
  assert.match(dockerfile, /keycloak-entrypoint\.sh/)
  assert.match(compose, /CASELAW_PASSWORDLESS_AUTO_APPLY: \$\{CASELAW_PASSWORDLESS_AUTO_APPLY:-false\}/)
  assert.match(entrypoint, /CASELAW_PASSWORDLESS_AUTO_APPLY:-false/)
  assert.match(entrypoint, /Keycloak will remain available on its previous browser flow/)
})

test('the installer can apply the generic flow without Case Law estate clients', () => {
  assert.match(compose, /CASELAW_PASSWORDLESS_ESTATE_MODE: \$\{CASELAW_PASSWORDLESS_ESTATE_MODE:-\}/)
  assert.match(nodeConfigurator, /envBoolean\('CASELAW_PASSWORDLESS_ESTATE_MODE', realm === 'caselaw'\)/)
  assert.match(nodeConfigurator, /if \(estateMode\) \{[\s\S]*?ensureCitationsApiClient\(\)[\s\S]*?validateEstateClients\(\)/)
  assert.match(goConfigurator, /envBool\("CASELAW_PASSWORDLESS_ESTATE_MODE", realm == "caselaw"\)/)
  assert.match(goConfigurator, /if i\.estateMode \{[\s\S]*?i\.ensureCitationsAPIClient\(\)[\s\S]*?i\.validateEstateClients\(\)/)
})

test('installers require the email-identity provider and disable the password registration form', () => {
  assert.match(nodeConfigurator, /requireProvider\('caselaw-email-identity'\)/)
  assert.match(nodeConfigurator, /addExecution\(formsFlow, 'caselaw-email-identity', 'REQUIRED'\)/)
  assert.match(nodeConfigurator, /registrationAllowed: false/)
  assert.match(goConfigurator, /i\.requireProvider\("caselaw-email-identity"\)/)
  assert.match(goConfigurator, /i\.addExecution\(formsFlow, "caselaw-email-identity", "REQUIRED"\)/)
  assert.match(goConfigurator, /"registrationAllowed":\s+false/)
  assert.match(dockerfile, /caselaw-email-identity\.jar/)
})

test('new nested aliases do not collide with the previously deployed passwordless flow', () => {
  for (const configurator of [nodeConfigurator, goConfigurator]) {
    assert.doesNotMatch(configurator, /Case Law passwordless forms/)
    assert.match(configurator, /Case Law email-first forms/)
    assert.match(configurator, /Case Law email-first methods/)
    assert.match(configurator, /caselaw-email-first-otp/)
    assert.match(configurator, /caselaw-email-first-magic-link/)
  }
})

test('installers make default name fields optional without overwriting custom profile rules', () => {
  assert.match(nodeConfigurator, /\/users\/profile/)
  assert.match(nodeConfigurator, /isDefaultNameRequirement/)
  assert.match(nodeConfigurator, /custom user-profile requirement\. Refusing to overwrite drift/)
  assert.match(goConfigurator, /"\/users\/profile"/)
  assert.match(goConfigurator, /isDefaultNameRequirement/)
  assert.match(goConfigurator, /custom user-profile requirement; refusing to overwrite drift/)
})
