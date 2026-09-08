import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')
const compose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8')
const operations = await readFile(new URL('../docs/OTP_OPERATIONS.md', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(
  new URL('../packages/caselaw-auth/package.json', import.meta.url),
))

test('the tested OTP version matrix matches every production default', () => {
  assert.match(dockerfile, /^ARG KEYCLOAK_VERSION=26\.7\.0$/m)
  assert.match(dockerfile, /^ARG MAGIC_LINK_VERSION=0\.75$/m)
  assert.match(compose, /KEYCLOAK_VERSION:-26\.7\.0/)
  assert.match(compose, /MAGIC_LINK_VERSION:-0\.75/)
  assert.match(operations, /\| Keycloak \| `26\.7\.0` \|/)
  assert.match(operations, /\| Phase Two `keycloak-magic-link` provider \| `0\.75` \|/)
  assert.match(operations, /\| Case Law email-identity provider \| `1\.1\.0`/)
  assert.match(dockerfile, /caselaw-email-identity-1\.1\.0\.jar/)
  const escapedVersion = packageJson.version.replaceAll('.', '\\.')
  assert.match(operations, new RegExp(`caselaw-auth@${escapedVersion}`))
})
