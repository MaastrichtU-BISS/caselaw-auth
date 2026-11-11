import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import pkg from '../packages/biss-auth/package.json' with { type: 'json' }
import legacy from '../packages/caselaw-auth/package.json' with { type: 'json' }
if (pkg.dependencies['caselaw-auth'] !== legacy.version) {
  throw new Error('biss-auth must pin the tested caselaw-auth implementation version')
}
const dist = new URL('../packages/biss-auth/dist/', import.meta.url)
await mkdir(dist, { recursive: true })
for (const entry of ['index', 'client', 'server', 'svelte', 'vue']) {
  const target = entry === 'index' ? 'caselaw-auth' : `caselaw-auth/${entry}`
  await writeFile(new URL(`${entry}.js`, dist), `export * from '${target}'\n`)
  await writeFile(new URL(`${entry}.cjs`, dist), `module.exports = require('${target}')\n`)
  await writeFile(new URL(`${entry}.d.ts`, dist), `export * from '${target}'\n`)
}
await copyFile(new URL('../packages/caselaw-auth/dist/style.css', import.meta.url), new URL('style.css', dist))
