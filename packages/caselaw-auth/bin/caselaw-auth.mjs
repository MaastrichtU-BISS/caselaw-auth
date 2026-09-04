#!/usr/bin/env node

const [command, ...extraArguments] = process.argv.slice(2)

if (!command || command === '--help' || command === '-h') {
  printHelp()
  process.exit(0)
}

if (command !== 'apply-passwordless-flow') {
  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exit(1)
}

if (extraArguments.length > 0) {
  console.error('apply-passwordless-flow does not accept positional arguments; configure it with environment variables.')
  process.exit(1)
}

await import('../admin/apply-passwordless-flow.mjs')

function printHelp() {
  console.log(`caselaw-auth administration commands

Usage:
  caselaw-auth apply-passwordless-flow

Required environment variables:
  KEYCLOAK_ADMIN
  KEYCLOAK_ADMIN_PASSWORD

Optional environment variables:
  KEYCLOAK_URL                       default: http://localhost:8080
  KEYCLOAK_REALM                     default: caselaw
  KEYCLOAK_ADMIN_REALM               default: master
  CASELAW_PASSWORDLESS_ESTATE_MODE   default: true only for the caselaw realm
`)
}
