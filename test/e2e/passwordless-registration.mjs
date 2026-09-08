import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const keycloakUrl = (process.env.E2E_KEYCLOAK_URL || 'http://localhost:18080').replace(/\/$/, '')
const adminUrl = (process.env.E2E_ADMIN_URL || keycloakUrl).replace(/\/$/, '')
const mailpitUrl = (process.env.E2E_MAILPIT_URL || 'http://localhost:18025').replace(/\/$/, '')
const adminUser = process.env.KEYCLOAK_ADMIN || 'admin'
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'passwordless-e2e-admin'
const realm = process.env.KEYCLOAK_REALM || 'caselaw'
const clientId = 'caselaw-frontend'
const redirectUri = 'http://localhost:3000/auth/callback'
const testEmail = process.env.E2E_TEST_EMAIL || `passwordless-${Date.now()}@example.test`

class CookieBrowser {
  #cookies = new Map()

  async fetch(input, options = {}) {
    const headers = new Headers(options.headers)
    if (this.#cookies.size > 0) {
      headers.set('cookie', [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    }
    const response = await fetch(input, { ...options, headers, redirect: 'manual' })
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0]
      const separator = pair.indexOf('=')
      const name = pair.slice(0, separator)
      const value = pair.slice(separator + 1)
      if (value) this.#cookies.set(name, value)
      else this.#cookies.delete(name)
    }
    return response
  }
}

await waitFor(`${keycloakUrl}/realms/${encodeURIComponent(realm)}/.well-known/openid-configuration`, 240_000)
await waitFor(`${mailpitUrl}/api/v1/info`, 60_000)

const adminToken = await getAdminToken()
await waitForRealmConfiguration(adminToken)
await configureSmtp(adminToken)

const verifier = randomBytes(48).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')
const state = randomBytes(16).toString('base64url')
const authorize = new URL(`${keycloakUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/auth`)
authorize.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'openid email profile',
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString()

const browser = new CookieBrowser()
const login = await browser.fetch(authorize)
assert.equal(login.status, 200, `authorization page returned ${login.status}`)
const loginHtml = await login.text()
await verifyFavicon(loginHtml)
assert.doesNotMatch(loginHtml, /\bregister\b/i, 'the separate registration link must not be rendered')
assert.doesNotMatch(loginHtml, /name=["']password["']/i, 'password must not be requested')
const loginAction = formAction(loginHtml)

const otpPage = await browser.fetch(loginAction, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ username: testEmail }),
})
assert.equal(otpPage.status, 200, `email submission returned ${otpPage.status}`)
const otpHtml = await otpPage.text()
assert.equal(faviconPath(otpHtml), faviconPath(loginHtml), 'OTP must retain the project favicon')
assert.match(otpHtml, /name=["']otp["']/i, 'email submission did not reach the OTP form')
assert.doesNotMatch(otpHtml, /id=["']try-another-way["']/i, 'OTP-only flow must not offer a method chooser')
assert.doesNotMatch(otpHtml, /name=["'](?:firstName|lastName|password)["']/i,
  'OTP form must not request names or a password')

function faviconPath(html) {
  const icons = [...html.matchAll(/<link\b[^>]*\brel="icon"[^>]*>/g)]
  assert.equal(icons.length, 1, 'the project must replace, not supplement, the inherited Keycloak icon')
  return icons[0][0].match(/href="([^"]+)"/)[1]
}

async function verifyFavicon(html) {
  const path = faviconPath(html)
  const theme = process.env.E2E_LOGIN_THEME || 'caselaw'
  const file = theme === 'digimach' ? 'digimach-mark.svg' : 'caselaw-favicon-v1.svg'
  assert.ok(path.endsWith(`/login/${theme}/img/${file}`), 'favicon must come from the selected project theme')
  const iconUrl = new URL(path, keycloakUrl)
  assert.equal(iconUrl.origin, new URL(keycloakUrl).origin, 'favicon stays on the project auth origin')
  const response = await fetch(iconUrl)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /image\/svg\+xml/)
  const { readFile } = await import('node:fs/promises')
  const expected = await readFile(new URL(`../../themes/${theme}/login/resources/img/${file}`, import.meta.url), 'utf8')
  assert.equal((await response.text()).trim(), expected.trim(), 'served favicon matches the bundled project asset')
}

const pendingUsers = await usersByEmail(adminToken, testEmail)
assert.equal(pendingUsers.length, 1, 'submitting a new email must create exactly one pending user')
assert.equal(pendingUsers[0].emailVerified, false, 'the account must remain unverified before OTP proof')
assert.equal(pendingUsers[0].firstName, undefined)
assert.equal(pendingUsers[0].lastName, undefined)
const pendingUserDetail = await adminApi(adminToken, `/users/${encodeURIComponent(pendingUsers[0].id)}`)
assert.deepEqual(pendingUserDetail.attributes?.['caselaw.pending-email-otp'], ['true'],
  'pending self-service account must carry the cleanup provenance marker')

const otp = await readOtp(testEmail)
const callback = await browser.fetch(formAction(otpHtml), {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ otp, submit: 'Verify code' }),
})
assert.equal(callback.status, 302, `OTP submission returned ${callback.status}`)
const callbackUrl = await followToCallback(browser, callback)
assert.equal(callbackUrl.origin + callbackUrl.pathname, redirectUri)
assert.equal(callbackUrl.searchParams.get('state'), state)
assert.ok(callbackUrl.searchParams.get('code'), 'callback did not contain an authorization code')

const tokenResponse = await fetch(`${keycloakUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code: callbackUrl.searchParams.get('code'),
    code_verifier: verifier,
  }),
})
assert.equal(tokenResponse.status, 200, `authorization-code exchange returned ${tokenResponse.status}`)
const tokens = await tokenResponse.json()
assert.ok(tokens.access_token)
const expectedIssuer = `${keycloakUrl}/realms/${encodeURIComponent(realm)}`
assert.equal(JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url')).iss, expectedIssuer)
assert.equal(JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url')).iss, expectedIssuer)

if (process.env.E2E_VERIFY_DOMAIN === 'true') {
  for (const html of [loginHtml, otpHtml]) {
    assert.equal(new URL(formAction(html)).origin, new URL(keycloakUrl).origin)
    for (const [, source] of html.matchAll(/(?:src|href)=["']([^"']*\/resources\/[^"']+)["']/g)) {
      const resource = new URL(decodeHtml(source), keycloakUrl)
      assert.equal(resource.origin, new URL(keycloakUrl).origin)
      assert.equal((await fetch(resource, { redirect: 'manual' })).status, 200, 'theme resource must load on the project origin without a redirect')
    }
  }
  const refreshed = await fetch(`${expectedIssuer}/protocol/openid-connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token }),
  })
  assert.equal(refreshed.status, 200, 'refresh must work through the project origin')
  const refreshedTokens = await refreshed.json()
  assert.equal(JSON.parse(Buffer.from(refreshedTokens.access_token.split('.')[1], 'base64url')).iss, expectedIssuer)
  const logout = new URL(`${expectedIssuer}/protocol/openid-connect/logout`)
  logout.search = new URLSearchParams({ id_token_hint: tokens.id_token, post_logout_redirect_uri: redirectUri }).toString()
  const loggedOut = await browser.fetch(logout)
  assert.equal(loggedOut.status, 302, 'logout must return to the registered application')
  assert.equal(loggedOut.headers.get('location'), redirectUri)
  assert.match(await (await browser.fetch(authorize)).text(), /name=["']username["']/, 'logout must end the Keycloak SSO session')
  await verifyMagicLinkDisabled()
}

const users = await usersByEmail(adminToken, testEmail)
assert.equal(users.length, 1, 'OTP completion must not create a duplicate user')
const [user] = users
assert.equal(user.username, testEmail)
assert.equal(user.email, testEmail)
assert.equal(user.enabled, true)
assert.equal(user.emailVerified, true)
assert.equal(user.firstName, undefined)
assert.equal(user.lastName, undefined)
const credentials = await adminApi(adminToken, `/users/${encodeURIComponent(user.id)}/credentials`)
assert.deepEqual(credentials, [], 'email-only account must not have a password credential')

const liveRealm = await adminApi(adminToken, '')
assert.equal(liveRealm.browserFlow, 'caselaw-browser-passwordless-email-first')
assert.equal(liveRealm.registrationAllowed, false)

const health = spawnSync(process.execPath, [
  'packages/caselaw-auth/bin/caselaw-auth.mjs',
  'check-passwordless',
], {
  cwd: new URL('../..', import.meta.url),
  encoding: 'utf8',
  env: {
    ...process.env,
    KEYCLOAK_URL: adminUrl,
    KEYCLOAK_REALM: realm,
    KEYCLOAK_ADMIN_REALM: 'master',
    KEYCLOAK_ADMIN: adminUser,
    KEYCLOAK_ADMIN_PASSWORD: adminPassword,
    CASELAW_PASSWORDLESS_ESTATE_MODE: process.env.E2E_ESTATE_MODE || 'true',
  },
})
assert.equal(health.status, 0, `${health.stdout}\n${health.stderr}`)
assert.ok(health.stdout.includes(`PASS ${realm}`))

console.log(`PASS ${testEmail}: unknown email -> OTP -> verified OIDC account without names or password`)

async function getAdminToken() {
  const response = await fetch(`${adminUrl}/realms/master/protocol/openid-connect/token`, {
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

async function configureSmtp(token) {
  const current = await adminApi(token, '')
  await adminApi(token, '', {
    method: 'PUT',
    body: {
      ...current,
      smtpServer: {
        host: 'mailpit',
        port: '1025',
        from: 'login@example.test',
        fromDisplayName: 'Case Law Explorer test',
        auth: 'false',
        starttls: 'false',
        ssl: 'false',
      },
    },
  })
}

async function waitForRealmConfiguration(token) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const current = await adminApi(token, '')
    if (current.browserFlow === 'caselaw-browser-passwordless-email-first'
        && current.registrationAllowed === false) return
    await delay(250)
  }
  throw new Error('passwordless realm configurator did not finish')
}

async function usersByEmail(token, email) {
  return adminApi(token, `/users?email=${encodeURIComponent(email)}&exact=true`)
}

async function adminApi(token, suffix, options = {}) {
  const response = await fetch(`${adminUrl}/admin/realms/${encodeURIComponent(realm)}${suffix}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  assert.ok(response.ok, `admin API ${options.method || 'GET'} ${suffix || '/'} returned ${response.status}`)
  if (response.status === 204) return undefined
  return response.json()
}

async function readOtp(email) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`)
    if (response.ok) {
      const { messages = [] } = await response.json()
      const message = messages.find((candidate) => candidate.To?.some((to) => to.Address === email))
      if (message) {
        const detailResponse = await fetch(`${mailpitUrl}/api/v1/message/${encodeURIComponent(message.ID)}`)
        assert.equal(detailResponse.status, 200)
        const detail = await detailResponse.json()
        const match = `${detail.Text || ''}\n${detail.HTML || ''}`.match(/\b\d{6}\b/)
        assert.ok(match, 'OTP email did not contain a six-digit code')
        return match[0]
      }
    }
    await delay(250)
  }
  throw new Error(`no OTP message arrived for ${email}`)
}

async function verifyMagicLinkDisabled() {
  const magicBrowser = new CookieBrowser()
  const first = await magicBrowser.fetch(authorize)
  const emailPage = await magicBrowser.fetch(formAction(await first.text()), {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: testEmail }),
  })
  const emailHtml = await emailPage.text()
  const chooser = await magicBrowser.fetch(formAction(emailHtml), {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ tryAnotherWay: 'on' }),
  })
  const chooserHtml = await chooser.text()
  assert.doesNotMatch(chooserHtml, />\s*Magic link\s*</i, 'crafted method selection must not offer magic links')
  const methods = await adminApi(adminToken, '/authentication/flows/Case%20Law%20email-first%20methods/executions')
  const magic = methods.find(item => item.providerId === 'ext-magic-form')
  assert.equal(magic.requirement, 'DISABLED')
  assert.equal(methods.find(item => item.providerId === 'ext-email-otp').requirement, 'REQUIRED')
  const forced = await magicBrowser.fetch(formAction(emailHtml), {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ authenticationExecution: magic.id }),
  })
  const forcedHtml = await forced.text()
  assert.doesNotMatch(forcedHtml, /click on the link to log in/i, 'disabled magic execution must not send a link')
}

async function followToCallback(browser, initialResponse) {
  let response = initialResponse
  for (let redirects = 0; redirects < 6; redirects += 1) {
    assert.ok([301, 302, 303, 307, 308].includes(response.status),
      `post-OTP navigation returned ${response.status}`)
    const location = new URL(response.headers.get('location'))
    if (location.origin + location.pathname === redirectUri) return location
    if (process.env.E2E_VERIFY_DOMAIN === 'true') {
      assert.equal(location.origin, new URL(keycloakUrl).origin, 'intermediate redirects must stay on the project origin')
    }
    response = await browser.fetch(location)
    if (response.status === 200) {
      const html = await response.text()
      assert.doesNotMatch(html, /name=["'](?:firstName|lastName|password)["']/i,
        'post-OTP flow requested names or a password')
      throw new Error(`post-OTP flow stopped at ${location.pathname} instead of the application callback`)
    }
  }
  throw new Error('post-OTP flow exceeded its redirect limit')
}

function formAction(html) {
  const form = html.match(/<form\b[^>]*\baction=["']([^"']+)["'][^>]*>/i)
  assert.ok(form, 'page did not contain a form action')
  return decodeHtml(form[1])
}

function decodeHtml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&#x2F;', '/').replaceAll('&#47;', '/')
}

async function waitFor(url, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await delay(500)
  }
  throw new Error(`timed out waiting for ${url}`)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
