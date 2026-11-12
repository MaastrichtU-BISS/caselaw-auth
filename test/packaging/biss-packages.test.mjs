import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

test('standalone BISS tarball and legacy facade preserve APIs, CLI and previous sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biss-package-check-'))
  const run = (command, args, cwd = dir) => execFileSync(command, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    for (const pkg of ['biss-auth', 'caselaw-auth']) {
      run('npm', ['pack', '--pack-destination', dir], resolve('packages', pkg))
    }
    const legacyVersion = JSON.parse(await readFile('packages/caselaw-auth/package.json')).version
    const bissVersion = JSON.parse(await readFile('packages/biss-auth/package.json')).version
    await writeFile(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund',
      join(dir, `biss-auth-${bissVersion}.tgz`),
      'vue@^3.5.0', 'svelte@^5.0.0', 'typescript@^5.5.0'])
    // A BISS-only application must not need the legacy distribution at all.
    await assert.rejects(access(join(dir, 'node_modules/caselaw-auth')), { code: 'ENOENT' })
    const installed = JSON.parse(await readFile(join(dir, 'node_modules/biss-auth/package.json')))
    assert.equal(installed.dependencies?.['caselaw-auth'], undefined)
    const help = run(process.execPath, ['node_modules/.bin/biss-auth', '--help'])
    assert.match(help, /biss-auth apply-passwordless-flow/)
    assert.match(help, /KEYCLOAK_ADMIN_PASSWORD/)
    assert.match(help, /dry run unless --execute/)

    // Add the new legacy facade and an immutable, previously published BISS
    // release. Its exact old dependency must remain independent of this pair.
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund',
      join(dir, `caselaw-auth-${legacyVersion}.tgz`),
      'previous-biss-auth@npm:biss-auth@0.6.5'])
    await writeFile(join(dir, 'check.mjs'), `
      import assert from 'node:assert/strict'
      import { createRequire } from 'node:module'
      const require = createRequire(import.meta.url)
      for (const subpath of ['', '/client', '/server', '/svelte', '/vue']) {
        const old = await import('caselaw-auth' + subpath)
        const canonical = await import('biss-auth' + subpath)
        const previous = await import('previous-biss-auth' + subpath)
        assert.deepEqual(Object.keys(canonical), Object.keys(previous))
        assert.deepEqual(Object.keys(canonical), Object.keys(old))
        for (const key of Object.keys(old)) assert.equal(canonical[key], old[key])
        assert.equal(require('caselaw-auth' + subpath), require('biss-auth' + subpath))
      }
      const { createServerAuth } = await import('biss-auth/server')
      const { createServerAuth: previousFactory } = await import('previous-biss-auth/server')
      const config = { issuer: 'https://issuer.example/realms/test', clientId: 'test',
        redirectUri: 'https://app.example/callback', sessionSecret: 'test-secret' }
      const previous = previousFactory(config), canonical = createServerAuth(config)
      const session = { user: { id: 'user-1' }, roles: [], expiresAt: Math.floor(Date.now()/1000)+3600 }
      assert.deepEqual(await canonical.unsealSession(await previous.sealSession(session)), session)
      assert.deepEqual(await previous.unsealSession(await canonical.sealSession(session)), session)
    `)
    run(process.execPath, ['check.mjs'])
    assert.equal(await readFile(join(dir, 'node_modules/biss-auth/dist/style.css'), 'utf8'),
      await readFile(join(dir, 'node_modules/caselaw-auth/dist/style.css'), 'utf8'))
    assert.match(run(process.execPath, ['node_modules/.bin/caselaw-auth', '--help']), /caselaw-auth apply-passwordless-flow/)
    for (const pkg of ['biss-auth', 'caselaw-auth']) {
      assert.throws(() => run(process.execPath, [`node_modules/.bin/${pkg}`, 'unknown']),
        error => error.status === 1 && /Unknown command/.test(error.stderr))
      assert.throws(() => run(process.execPath, [`node_modules/.bin/${pkg}`, 'cleanup-unverified-users', '--max-age-days', '-1']),
        error => error.status === 1 && /must be a non-negative number/.test(error.stderr))
    }
    await writeFile(join(dir, 'check.ts'), `
      import { createAuthClient } from 'biss-auth'
      import { createServerAuth, COOKIE_BYTE_LIMIT } from 'biss-auth/server'
      import { createSvelteAuth } from 'biss-auth/svelte'
      import { createCaselawAuth } from 'biss-auth/vue'
      import { createServerAuth as legacy } from 'caselaw-auth/server'
      void [createAuthClient, createServerAuth, COOKIE_BYTE_LIMIT, createSvelteAuth, createCaselawAuth, legacy]
    `)
    run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--skipLibCheck',
      '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', 'check.ts'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
