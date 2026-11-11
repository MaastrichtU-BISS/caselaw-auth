#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
const args = process.argv.slice(2)
if (!args.length || args[0] === '--help' || args[0] === '-h') {
  console.log(`BISS Auth administration commands

Usage:
  biss-auth apply-passwordless-flow
  biss-auth check-passwordless
  biss-auth cleanup-unverified-users [--max-age-days DAYS] [--execute]

Uses the same KEYCLOAK_* and CASELAW_* environment variables as caselaw-auth.
Run caselaw-auth --help for the full environment and safety reference.
cleanup-unverified-users is a dry run unless --execute is supplied.
`)
} else {
  // Resolve the installed implementation; the package may be nested by npm.
  const entry = fileURLToPath(import.meta.resolve('caselaw-auth/server'))
  await import(resolve(dirname(entry), '../bin/caselaw-auth.mjs'))
}
