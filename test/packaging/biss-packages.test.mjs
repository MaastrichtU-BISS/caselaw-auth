import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

// Installed tarballs catch missing dist files, broken exports and nested dependency
// resolution that workspace symlinks would hide. Use the published legacy SDK
// to prove that the facade works with the artifact consumers actually receive.
test('packed BISS SDK preserves APIs, declarations, CSS, CLI and sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biss-package-check-'))
  const run = (command, args, cwd = dir) => execFileSync(command, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    run('npm', ['pack', '--pack-destination', dir], resolve('packages/biss-auth'))
    const version = JSON.parse(await readFile('packages/caselaw-auth/package.json')).version
    const bissVersion = JSON.parse(await readFile('packages/biss-auth/package.json')).version
    await writeFile(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund',
      `caselaw-auth@${version}`, join(dir, `biss-auth-${bissVersion}.tgz`),
      'vue@^3.5.0', 'svelte@^5.0.0', 'typescript@^5.5.0'])
    await writeFile(join(dir, 'check.mjs'), `
      import assert from 'node:assert/strict'
      import { createRequire } from 'node:module'
      const require = createRequire(import.meta.url)
      for (const subpath of ['', '/client', '/server', '/svelte', '/vue']) {
        const old = await import('caselaw-auth' + subpath)
        const renamed = await import('biss-auth' + subpath)
        assert.deepEqual(Object.keys(renamed), Object.keys(old))
        for (const key of Object.keys(old)) assert.equal(renamed[key], old[key])
        const oldCjs = require('caselaw-auth' + subpath)
        const newCjs = require('biss-auth' + subpath)
        assert.equal(newCjs, oldCjs)
      }
      const { createServerAuth } = await import('biss-auth/server')
      const { createServerAuth: oldFactory } = await import('caselaw-auth/server')
      const config = { issuer: 'https://issuer.example/realms/test', clientId: 'test',
        redirectUri: 'https://app.example/callback', sessionSecret: 'test-secret' }
      const old = oldFactory(config), renamed = createServerAuth(config)
      const session = { user: { id: 'user-1' }, roles: [], expiresAt: Math.floor(Date.now()/1000)+3600 }
      assert.deepEqual(await renamed.unsealSession(await old.sealSession(session)), session)
      assert.deepEqual(await old.unsealSession(await renamed.sealSession(session)), session)
    `)
    run(process.execPath, ['check.mjs'])
    assert.equal(await readFile(join(dir, 'node_modules/biss-auth/dist/style.css'), 'utf8'),
      await readFile(join(dir, 'node_modules/caselaw-auth/dist/style.css'), 'utf8'))
    const help = run(process.execPath, ['node_modules/.bin/biss-auth', '--help'])
    assert.match(help, /biss-auth apply-passwordless-flow/)
    assert.match(help, /dry run unless --execute/)
    assert.throws(() => run(process.execPath, ['node_modules/.bin/biss-auth', 'unknown']),
      error => error.status === 1 && /Unknown command/.test(error.stderr))
    await writeFile(join(dir, 'check.ts'), `
      import { createAuthClient } from 'biss-auth'
      import { createServerAuth, COOKIE_BYTE_LIMIT } from 'biss-auth/server'
      import { createSvelteAuth } from 'biss-auth/svelte'
      import { createCaselawAuth } from 'biss-auth/vue'
      import { createAuthClient as client } from 'biss-auth/client'
      void [createAuthClient, createServerAuth, COOKIE_BYTE_LIMIT, createSvelteAuth, createCaselawAuth, client]
    `)
    run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--skipLibCheck',
      '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', 'check.ts'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
