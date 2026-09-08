// Manual live-domain acceptance fixture, NOT a production application.
// Run after `npm run build`; no admin credentials are needed by this process.
// Uses only the isolated domain-canary realm and an exact loopback callback.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createServerAuth, createPkcePair, randomToken } from '../../packages/caselaw-auth/dist/server.js'

const origin = 'http://127.0.0.1:8097'
const issuer = 'https://auth-test.caselawexplorer.tech/realms/domain-canary'
const clientId = 'domain-canary-browser'
const auth = createServerAuth({ issuer, clientId, redirectUri: `${origin}/auth/callback`, sessionSecret: randomToken(48) })
const transactions = new Map()
const sessions = new Map()
const report = { issuer, checks: [], journeys: 0 }
const pass = (check) => { if (!report.checks.includes(check)) report.checks.push(check) }
const cookie = (req, key) => (req.headers.cookie || '').split('; ').find(v => v.startsWith(`${key}=`))?.slice(key.length + 1)
const redirect = (res, url, cookies = []) => res.writeHead(302, { location: url, 'set-cookie': cookies }).end()
const setCookie = (key, value, age = 600) => `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}`
const theme = await readFile(new URL('../../themes/caselaw/login/resources/css/caselaw-login-v2.css', import.meta.url), 'utf8')
function page(res, status, title, description, signedIn = false) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><html lang="en" class="login-pf"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Authentication test</title><link rel="stylesheet" href="/auth-theme.css"><style>.login-pf-page{padding-bottom:48px}.login-pf-page .card-pf::before{display:none}.canary-actions{display:grid;gap:18px;margin-top:28px}.canary-primary{display:block;border-radius:9px;padding:14px 20px;background:var(--cle-primary);color:white!important;text-align:center;font-weight:650;text-decoration:none}.canary-primary:hover{background:var(--cle-primary-hover)}a:focus-visible{outline:2px solid var(--cle-primary);outline-offset:4px}.canary-note{margin-top:28px;color:var(--cle-muted);font-size:12px;line-height:1.5}</style></head><body><main class="login-pf-page"><section class="card-pf" aria-labelledby="kc-page-title"><h1 id="kc-page-title">${title}</h1><p class="cle-auth-intro">${description}</p><div class="canary-actions"><a class="canary-primary" href="${signedIn ? '/auth/logout' : '/auth/login'}">${signedIn ? 'Sign out' : 'Start a new sign-in'}</a><a href="/report">View test results</a></div><p class="canary-note">Isolated authentication test. Your Case Law and DigiMach accounts are unchanged.</p></section></main></body></html>`)
}

const server = createServer(async (req, res) => {
  // Loopback only, and reject DNS-rebinding requests.
  if (req.headers.host !== '127.0.0.1:8097') return res.writeHead(421).end()
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const url = new URL(req.url, origin)
  let failure = 'The authentication checks could not be completed. Start a new sign-in and try again.'
  try {
    if (req.method !== 'GET') return res.writeHead(405).end()
    if (url.pathname === '/auth-theme.css') {
      res.setHeader('Content-Type', 'text/css; charset=utf-8')
      return res.end(theme)
    }
    if (url.pathname === '/auth/login') {
      const { verifier, challenge } = await createPkcePair()
      const state = randomToken(), nonce = randomToken(), id = randomToken()
      for (const [key, tx] of transactions) if (tx.expires < Date.now()) transactions.delete(key)
      assert.ok(transactions.size < 20, 'Too many pending test journeys')
      transactions.set(id, { state, nonce, verifier, expires: Date.now() + 600_000 })
      const target = await auth.authorizationUrl({ state, nonce, codeChallenge: challenge })
      assert.equal(new URL(target).origin, new URL(issuer).origin)
      return redirect(res, target, [setCookie('canary_tx', id)])
    }
    if (url.pathname === '/auth/callback') {
      failure = 'The sign-in session is missing, expired, or belongs to another browser. Start again here and enter the code from your email.'
      const id = cookie(req, 'canary_tx'), tx = transactions.get(id)
      assert.ok(tx && tx.expires > Date.now() && url.searchParams.get('state') === tx.state, 'Invalid callback state')
      transactions.delete(id)
      assert.ok(url.searchParams.get('code'), 'Missing authorization code')
      failure = 'The authentication checks could not be completed. Start a new sign-in and try again.'
      const tokens = await auth.exchangeCode({ code: url.searchParams.get('code'), codeVerifier: tx.verifier })
      const claims = await auth.verifyToken(tokens.access_token, { audience: 'domain-canary-api', azp: clientId })
      await auth.verifyToken(tokens.id_token, { audience: clientId, nonce: tx.nonce })
      assert.equal(claims.email_verified, true)
      pass('PKCE code exchange, state, ID-token nonce, signatures, issuer and API audience')
      await assert.rejects(auth.verifyToken(tokens.access_token, { audience: 'wrong-audience' }))
      const parts = tokens.access_token.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url'))
      parts[1] = Buffer.from(JSON.stringify({ ...payload, sub: 'tampered' })).toString('base64url')
      await assert.rejects(auth.verifyToken(parts.join('.')))
      pass('Wrong audience and tampered token rejected')
      const refreshed = await auth.refreshToken(tokens.refresh_token)
      assert.ok(refreshed?.access_token, 'Refresh failed')
      await auth.verifyToken(refreshed.access_token, { audience: 'domain-canary-api', azp: clientId })
      pass('Refresh through custom HTTPS origin')
      const sessionId = randomToken()
      sessions.set(sessionId, { tokens: refreshed, claims, idToken: tokens.id_token })
      report.journeys++
      // Deliberately never log tokens, codes, email addresses or cookie values.
      console.log(JSON.stringify(report))
      return redirect(res, '/', [setCookie('canary_tx', '', 0), setCookie('canary_session', sessionId)])
    }
    if (url.pathname === '/auth/logout') {
      const id = cookie(req, 'canary_session'), session = sessions.get(id)
      assert.ok(session, 'No test session')
      sessions.delete(id)
      const target = await auth.endSessionUrl({ idToken: session.idToken, returnTo: origin + '/' })
      assert.equal(new URL(target).origin, new URL(issuer).origin)
      return redirect(res, target, [setCookie('canary_session', '', 0)])
    }
    if (url.pathname === '/report') {
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify(report))
    }
    if (url.pathname === '/') {
      const signedIn = sessions.has(cookie(req, 'canary_session'))
      return page(res, 200, signedIn ? 'You’re signed in' : 'Authentication test', signedIn
        ? 'Your identity was verified. Token validation and refresh checks passed.'
        : 'Test email-code sign-in on the isolated authentication domain.', signedIn)
    }
    res.writeHead(404).end()
  } catch (error) {
    // Error messages from upstream might contain sensitive URLs: print only type.
    console.error('Canary check failed:', error.name)
    page(res, 400, 'Let’s start again', failure)
  }
})
server.listen(8097, '127.0.0.1', () => console.log(`Canary fixture: ${origin}/auth/login`))
