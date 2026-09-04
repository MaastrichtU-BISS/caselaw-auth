import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)))
const cliPath = fileURLToPath(new URL('../bin/caselaw-auth.mjs', import.meta.url))

test('the npm package exposes the realm administration CLI', () => {
  assert.equal(packageJson.bin['caselaw-auth'], './bin/caselaw-auth.mjs')
  assert.ok(packageJson.files.includes('admin'))
  assert.ok(packageJson.files.includes('bin'))
})

test('the CLI documents the remote passwordless installer', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /caselaw-auth apply-passwordless-flow/)
  assert.match(result.stdout, /KEYCLOAK_URL/)
  assert.match(result.stdout, /KEYCLOAK_REALM/)
  assert.match(result.stdout, /KEYCLOAK_ADMIN_PASSWORD/)
})

test('the CLI rejects unknown commands without contacting Keycloak', () => {
  const result = spawnSync(process.execPath, [cliPath, 'unknown'], { encoding: 'utf8' })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Unknown command: unknown/)
})
