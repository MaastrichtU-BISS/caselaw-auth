import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('each login theme declares its own local project favicon', async () => {
  for (const [theme, asset] of [['caselaw', 'caselaw-favicon-v1.svg'], ['digimach', 'digimach-mark.svg'], ['bizzash', 'bizzy-favicon-v4.svg'], ['bizzy', 'bizzy-favicon-v4.svg']]) {
    const properties = await read(`themes/${theme}/login/theme.properties`)
    assert.ok(properties.split('\n').includes(`favicons=img/${asset}`))
    const svg = await read(`themes/${theme}/login/resources/img/${asset}`)
    assert.match(svg, /<svg\b/)
    assert.doesNotMatch(svg, /<script\b|\bon\w+=|(?:href|src)=/i)
  }
})

test('the OTP page keeps the provider contract and mobile code semantics', async () => {
  const template = await read('themes/caselaw/login/otp-form.ftl')
  const script = await read('themes/caselaw/login/resources/js/otp-input-v1.js')

  assert.match(template, /name="submit"/)
  assert.match(template, /name="resend"/)
  assert.match(template, /autocomplete="one-time-code"/)
  assert.match(template, /inputmode="numeric"/)
  assert.match(template, /maxlength="6"/)
  assert.match(template, /data-1p-ignore="true"/)
  assert.match(template, /data-lpignore="true"/)
  assert.match(template, /section = "show-username"/)
  assert.match(template, /messagesPerField\.existsError\('totp'\)/)
  assert.equal(template.match(/data-otp-slot=/g)?.length, 1)
  assert.match(template, /<#list 1\.\.6 as index>/)
  assert.match(template, /aria-hidden="true"/)
  assert.match(script, /input\.value\.replace\(\/\\D\/g, ""\)\.slice\(0, slots\.length\)/)
  assert.match(script, /slot\.textContent = digits\.charAt\(index\)/)
})

test('the login theme uses a versioned stylesheet entry point', async () => {
  const properties = await read('themes/caselaw/login/theme.properties')
  const entrypoint = await read('themes/caselaw/login/resources/css/caselaw-login-v10.css')
  const styles = await read('themes/caselaw/login/resources/css/caselaw-login-v2.css')

  assert.match(properties, /^styles=css\/caselaw-login-v10\.css$/m)
  assert.match(properties, /^scripts=js\/otp-input-v1\.js$/m)
  assert.match(entrypoint, /caselaw-login-v2\.css\?revision=10/)
  assert.match(styles, /html\.login-pf body \{[\s\S]*?background: #ffffff !important;[\s\S]*?background-image: none !important;/)
  assert.match(styles, /\.login-pf body::before \{[\s\S]*?linear-gradient\(rgba\(148, 163, 184, 0\.14\) 1px, transparent 1px\)/)
  assert.match(styles, /\.login-pf body::before \{[\s\S]*?background-size: 32px 32px;/)
  assert.doesNotMatch(styles, /bg-login\.jpg/)
  assert.match(styles, /\.login-pf-page \{[\s\S]*?background: transparent;/)
  assert.match(styles, /\.cle-otp-control\.is-enhanced \.cle-otp-slots \{[\s\S]*?grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/)
  assert.match(styles, /\.cle-otp-control:focus-within \.cle-otp-slot\.is-active/)
})

test('the Digimach login theme inherits every Case Law state before branding it', async () => {
  const properties = await read('themes/digimach/login/theme.properties')
  const styles = await read('themes/digimach/login/resources/css/digimach-login-v1.css')
  const mark = await read('themes/digimach/login/resources/img/digimach-mark.svg')

  assert.match(properties, /^parent=caselaw$/m)
  assert.match(properties, /^styles=css\/caselaw-login-v10\.css css\/digimach-login-v1\.css$/m)
  assert.match(properties, /^scripts=js\/otp-input-v1\.js$/m)
  assert.match(properties, /footerBissUrl=.*https:\/\/digimach\.eu\//)
  assert.match(styles, /--digimach-brand: #33a58e;/)
  assert.match(styles, /--digimach-brand-strong: #2a8472;/)
  assert.match(styles, /--digimach-brand-weak: #edf4f3;/)
  assert.match(styles, /content: "DigiMach";/)
  assert.match(styles, /digimach-mark\.svg/)
  assert.match(styles, /#kc-form \.form-group > label,[\s\S]*?display: block;[\s\S]*?width: 100%;/)
  assert.match(styles, /#kc-form input\[type="email"\][\s\S]*?width: 100%;/)
  assert.match(styles, /\.cle-otp-control\.is-complete \.cle-otp-slot/)
  assert.match(styles, /prefers-reduced-motion|caselaw-login-v10/)
  assert.match(mark, /viewBox="0 0 32 32"/)
  assert.doesNotMatch(styles, /CASE LAW EXPLORER/)
})

test('the Digimach account theme inherits PatternFly coverage and overrides its brand', async () => {
  const properties = await read('themes/digimach/account/theme.properties')
  const styles = await read('themes/digimach/account/resources/css/digimach-account-v1.css')

  assert.match(properties, /^parent=caselaw$/m)
  assert.match(properties, /^styles=css\/caselaw-account\.css css\/digimach-account-v1\.css$/m)
  assert.match(styles, /--cle-primary: var\(--digimach-brand-strong\);/)
  assert.match(styles, /\.pf-v5-c-masthead__brand::after/)
  assert.match(styles, /content: "DigiMach";/)
  assert.match(styles, /\.pf-v5-c-nav__link\[aria-current="page"\]/)
})

test('the theme guide distinguishes realm-wide themes from project overrides', async () => {
  const guide = await read('docs/THEMES.md')

  assert.match(guide, /KEYCLOAK_REALM=digimach/)
  assert.match(guide, /KEYCLOAK_THEME=digimach/)
  assert.match(guide, /every project in a realm/)
  assert.match(guide, /client-level Account theme\s+override/)
  assert.match(guide, /Clients → _project client_ → Settings/)
})

test('both login themes keep the footer in normal document flow', async () => {
  const css = await read('themes/caselaw/login/resources/css/caselaw-login-v2.css')
  const footer = css.match(/\.login-pf \.cle-login-footer \{([^}]+)\}/)[1]
  assert.match(footer, /position: static;/)
  assert.match(footer, /transform: none;/)
  assert.doesNotMatch(footer, /bottom:|left:/)
  assert.match(footer, /max-width: 100%;/)
  const digimach = await read('themes/digimach/login/resources/css/digimach-login-v1.css')
  assert.doesNotMatch(digimach, /\.cle-login-footer\s*\{[^}]*position:\s*(?:fixed|absolute)/)
})

test('the OTP presentation keeps one sanitized field in sync with six visual slots', async () => {
  const script = await read('themes/caselaw/login/resources/js/otp-input-v1.js')
  const classes = () => {
    const values = new Set()
    return {
      add: (value) => values.add(value),
      contains: (value) => values.has(value),
      toggle: (value, enabled) => enabled ? values.add(value) : values.delete(value),
    }
  }
  const slots = Array.from({ length: 6 }, () => ({ classList: classes(), textContent: '' }))
  const inputListeners = new Map()
  const formListeners = new Map()
  const input = {
    addEventListener: (name, listener) => inputListeners.set(name, listener),
    form: { addEventListener: (name, listener) => formListeners.set(name, listener) },
    value: '',
  }
  const control = {
    classList: classes(),
    querySelector: (selector) => selector === '#otp' ? input : null,
    querySelectorAll: (selector) => selector === '[data-otp-slot]' ? slots : [],
  }
  const document = {
    activeElement: null,
    querySelector: (selector) => selector === '[data-otp-control]' ? control : null,
    readyState: 'complete',
  }

  runInNewContext(script, { document })
  assert.equal(control.classList.contains('is-enhanced'), true)

  document.activeElement = input
  input.value = '12a34'
  inputListeners.get('input')()
  assert.equal(input.value, '1234')
  assert.deepEqual(slots.map((slot) => slot.textContent), ['1', '2', '3', '4', '', ''])
  assert.equal(slots[4].classList.contains('is-active'), true)
  assert.equal(control.classList.contains('is-complete'), false)

  input.value = '6543217'
  inputListeners.get('input')()
  assert.equal(input.value, '654321')
  assert.deepEqual(slots.map((slot) => slot.textContent), ['6', '5', '4', '3', '2', '1'])
  assert.equal(control.classList.contains('is-complete'), true)
  formListeners.get('submit')()
})

test('legal links prefer the client\'s own documents over the theme default', async () => {
  const footer = await read('themes/caselaw/login/footer.ftl')
  const caselaw = await read('themes/caselaw/login/theme.properties')
  const digimach = await read('themes/digimach/login/theme.properties')

  assert.match(footer, /\(clientAttributes\.tosUri\)!''/)
  assert.match(footer, /\(clientAttributes\.policyUri\)!''/)
  assert.match(footer, /properties\.legalTermsUrl/)
  assert.match(footer, /\?matches\('https\?:\/\/\.\+'\)/)
  assert.match(caselaw, /^legalTermsUrl=\$\{env\.CASELAW_AUTH_TERMS_URL:https:\/\/app\.caselawexplorer\.tech\/terms-of-service\}$/m)
  assert.match(caselaw, /^legalPrivacyUrl=\$\{env\.CASELAW_AUTH_PRIVACY_URL:https:\/\/app\.caselawexplorer\.tech\/privacy-policy\}$/m)
  // DigiMach must not inherit Case Law Explorer's documents from its parent.
  assert.match(digimach, /^legalTermsUrl=\$\{env\.DIGIMACH_AUTH_TERMS_URL:https:\/\/digimach\.eu\/en\/terms-of-service\}$/m)
  assert.match(digimach, /^legalPrivacyUrl=\$\{env\.DIGIMACH_AUTH_PRIVACY_URL:https:\/\/digimach\.eu\/en\/privacy-policy\}$/m)
  assert.match(digimach, /^legalCookiesUrl=\$\{env\.DIGIMACH_AUTH_COOKIES_URL:\}$/m)
})

test('the Bizzash themes inherit the Case Law coverage and add only a Bizzy brand layer', async () => {
  const login = await read('themes/bizzy/login/theme.properties')
  const account = await read('themes/bizzy/account/theme.properties')
  const styles = await read('themes/bizzy/login/resources/css/bizzy-login-v2.css')
  const bizzy = await read('themes/bizzy/login/resources/img/bizzy-v2.svg')
  const en = await read('themes/bizzy/login/messages/messages_en.properties')
  const nl = await read('themes/bizzy/login/messages/messages_nl.properties')

  assert.match(login, /^parent=caselaw$/m)
  assert.match(account, /^parent=caselaw$/m)
  assert.match(login, /^styles=css\/caselaw-login-v10\.css css\/bizzy-login-v2\.css$/m)
  assert.match(login, /^scripts=js\/otp-input-v1\.js$/m)
  assert.match(account, /^styles=css\/caselaw-account\.css css\/bizzy-account-v1\.css$/m)
  // No Case Law Explorer documents on Bizzy.
  for (const key of ['legalTermsUrl', 'legalPrivacyUrl', 'legalCookiesUrl']) {
    assert.match(login, new RegExp(`^${key}=\\$\\{env\\.BIZZASH_AUTH_\\w+_URL:\\}$`, 'm'))
  }
  assert.match(login, /^footerManagedBy=\$\{env\.BIZZASH_AUTH_FOOTER_MANAGED_BY:Authentication managed by BISS Institute\}$/m)
  assert.match(styles, /--bizzy-blue: #005ca9;/)
  assert.match(styles, /--bizzy-yellow: #ffc917;/)
  // Fonts are served by the theme itself: no Google Fonts or other remote CSS.
  assert.doesNotMatch(styles, /@import|fonts\.googleapis|fonts\.gstatic|https?:\/\//)
  for (const match of styles.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)) {
    await access(new URL(`../themes/bizzy/login/resources/fonts/${match[1]}`, import.meta.url))
  }
  // The panel is decoration: it never takes clicks.
  assert.doesNotMatch(styles, /\.cle-login-footer\s*\{[^}]*position:\s*(?:fixed|absolute)/)
  assert.match(styles, /:lang\(nl\)::before/)
  assert.match(bizzy, /prefers-reduced-motion/)
  assert.doesNotMatch(bizzy, /<script\b|\bon\w+=|(?:href|src)=/i)
  // The current drawing: no blush on the cheeks.
  assert.doesNotMatch(bizzy, /ff8fa3|ff5c7a|cheek/i)
  for (const messages of [en, nl]) {
    assert.match(messages, /^loginAccountTitle=.*Bizzy/m)
    // The tab title and header follow the realm's display name; never the old name.
    assert.match(messages, /^loginTitle=.*\{0\}$/m)
    assert.match(messages, /^loginTitleHtml=\{0\}$/m)
    assert.doesNotMatch(messages, /^[^#].*Bizzash/im)
  }
})

test('the Bizzy email theme wraps every email it sends in one layout, in English and Dutch', async () => {
  const properties = await read('themes/bizzy/email/theme.properties')
  const layout = await read('themes/bizzy/email/html/template.ftl')
  const en = await read('themes/bizzy/email/messages/messages_en.properties')
  const nl = await read('themes/bizzy/email/messages/messages_nl.properties')
  const keys = (text) => text.split('\n').filter(line => /^\w[\w.-]*=/.test(line)).map(line => line.split('=')[0]).sort()

  assert.match(properties, /^parent=base$/m)
  assert.match(properties, /^locales=en,nl$/m)
  assert.deepEqual(keys(nl), keys(en))
  // A plain apostrophe would be eaten by MessageFormat.
  assert.doesNotMatch(en + nl, /^[^#=]+=.*[^']'[^']/m)
  // Email-client rules: table layout, no remote fonts or scripts, nothing that needs a picture to read.
  assert.match(layout, /<#macro emailLayout heading="" preheader="" reason="">/)
  assert.match(layout, /role="presentation"/)
  assert.doesNotMatch(layout, /<script|fonts\.googleapis|@import|<link\b/i)
  assert.match(layout, />BIZZY<\/a>/)
  for (const name of ['otp-email', 'magic-link-email', 'magic-link-continuation-email', 'executeActions', 'email-verification', 'email-update-confirmation', 'password-reset', 'email-test']) {
    const html = await read(`themes/bizzy/email/html/${name}.ftl`)
    const text = await read(`themes/bizzy/email/text/${name}.ftl`)
    assert.match(html, /<#import "template\.ftl" as layout>/)
    assert.match(html, /<@layout\.emailLayout heading=/)
    assert.match(text, /^<#ftl output_format="plainText">/)
    assert.match(text, /<@layout\.textLayout/)
    for (const key of [...`${html}\n${text}`.matchAll(/msg\("(\w+)"/g)].map(m => m[1])) {
      if (key.startsWith('requiredAction')) continue
      assert.match(en, new RegExp(`^${key}=`, 'm'), `${key} missing in English`)
    }
  }
  // The sign-in code: large, monospace, with how long it works.
  const otp = await read('themes/bizzy/email/html/otp-email.ftl')
  assert.match(otp, /<@layout\.code value=code note=msg\("otpValid"\)\/>/)
  assert.match(en, /^otpSubject=Your Bizzy sign-in code$/m)
  assert.match(nl, /^otpSubject=Je inlogcode voor Bizzy$/m)
  assert.match(en, /^otpValid=Valid for 10 minutes$/m)
})
