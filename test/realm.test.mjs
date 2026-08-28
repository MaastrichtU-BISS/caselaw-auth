import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const realm = JSON.parse(await readFile(new URL('../realm/caselaw-realm.json', import.meta.url)))

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

test('the realm binds the nested passwordless browser flow', () => {
  assert.equal(realm.browserFlow, 'caselaw-browser-passwordless')
  assert.equal(realm.accessCodeLifespanLogin, 600)

  const browser = flow('caselaw-browser-passwordless')
  assert.equal(execution(browser, 'auth-cookie').requirement, 'ALTERNATIVE')
  assert.equal(execution(browser, 'identity-provider-redirector').requirement, 'ALTERNATIVE')
  assert.equal(execution(browser, 'Case Law passwordless forms').requirement, 'ALTERNATIVE')

  const forms = flow('Case Law passwordless forms')
  assert.equal(execution(forms, 'auth-username-form').requirement, 'REQUIRED')
  assert.equal(execution(forms, 'Case Law email methods').requirement, 'REQUIRED')

  const methods = flow('Case Law email methods')
  assert.equal(execution(methods, 'ext-email-otp').requirement, 'ALTERNATIVE')
  assert.equal(execution(methods, 'ext-magic-form').requirement, 'ALTERNATIVE')
})

test('passwordless methods cannot create users and links are short-lived single-use credentials', () => {
  const byAlias = Object.fromEntries(realm.authenticatorConfig.map((item) => [item.alias, item.config]))
  assert.deepEqual(byAlias['caselaw-email-otp'], {
    'ext-magic-create-nonexistent-user': 'false',
  })
  assert.deepEqual(byAlias['caselaw-magic-link'], {
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
