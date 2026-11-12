import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import legacy from '../packages/caselaw-auth/package.json' with { type: 'json' }
import canonical from '../packages/biss-auth/package.json' with { type: 'json' }
if (legacy.dependencies['biss-auth'] !== canonical.version || canonical.dependencies?.['caselaw-auth']) {
  throw new Error('The legacy SDK must pin standalone BISS Auth; circular dependencies are forbidden')
}
const dist = new URL('../packages/caselaw-auth/dist/', import.meta.url)
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
for (const entry of ['index', 'client', 'server', 'svelte', 'vue']) {
  const target = entry === 'index' ? 'biss-auth' : `biss-auth/${entry}`
  await writeFile(new URL(`${entry}.js`, dist), `export * from '${target}'\n`)
  await writeFile(new URL(`${entry}.cjs`, dist), `module.exports = require('${target}')\n`)
  await writeFile(new URL(`${entry}.d.ts`, dist), `export * from '${target}'\n`)
}
await copyFile(new URL('../packages/biss-auth/dist/style.css', import.meta.url), new URL('style.css', dist))
