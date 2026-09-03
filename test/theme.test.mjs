import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the OTP page keeps the provider contract and mobile code semantics', async () => {
  const template = await read('themes/caselaw/login/otp-form.ftl')

  assert.match(template, /name="submit"/)
  assert.match(template, /name="resend"/)
  assert.match(template, /autocomplete="one-time-code"/)
  assert.match(template, /inputmode="numeric"/)
  assert.match(template, /maxlength="6"/)
  assert.match(template, /section = "show-username"/)
  assert.match(template, /messagesPerField\.existsError\('totp'\)/)
})

test('the login theme uses a versioned stylesheet entry point', async () => {
  const properties = await read('themes/caselaw/login/theme.properties')
  const entrypoint = await read('themes/caselaw/login/resources/css/caselaw-login-v6.css')
  const styles = await read('themes/caselaw/login/resources/css/caselaw-login-v2.css')

  assert.match(properties, /^styles=css\/caselaw-login-v6\.css$/m)
  assert.match(entrypoint, /caselaw-login-v2\.css\?revision=6/)
  assert.match(styles, /html\.login-pf body \{[\s\S]*?background: #ffffff !important;[\s\S]*?background-image: none !important;/)
  assert.match(styles, /\.login-pf body::before \{[\s\S]*?bg-login\.jpg[\s\S]*?background-position: center -6px;/)
  assert.match(styles, /\.login-pf body::before \{[\s\S]*?filter: grayscale\(1\) invert\(1\);/)
  assert.match(styles, /\.login-pf-page \{[\s\S]*?background: transparent;/)
})
