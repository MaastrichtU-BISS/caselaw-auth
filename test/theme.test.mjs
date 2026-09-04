import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

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
  const entrypoint = await read('themes/caselaw/login/resources/css/caselaw-login-v8.css')
  const styles = await read('themes/caselaw/login/resources/css/caselaw-login-v2.css')

  assert.match(properties, /^styles=css\/caselaw-login-v8\.css$/m)
  assert.match(properties, /^scripts=js\/otp-input-v1\.js$/m)
  assert.match(entrypoint, /caselaw-login-v2\.css\?revision=8/)
  assert.match(styles, /html\.login-pf body \{[\s\S]*?background: #ffffff !important;[\s\S]*?background-image: none !important;/)
  assert.match(styles, /\.login-pf body::before \{[\s\S]*?linear-gradient\(rgba\(148, 163, 184, 0\.14\) 1px, transparent 1px\)/)
  assert.match(styles, /\.login-pf body::before \{[\s\S]*?background-size: 32px 32px;/)
  assert.doesNotMatch(styles, /bg-login\.jpg/)
  assert.match(styles, /\.login-pf-page \{[\s\S]*?background: transparent;/)
  assert.match(styles, /\.cle-otp-control\.is-enhanced \.cle-otp-slots \{[\s\S]*?grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/)
  assert.match(styles, /\.cle-otp-control:focus-within \.cle-otp-slot\.is-active/)
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
