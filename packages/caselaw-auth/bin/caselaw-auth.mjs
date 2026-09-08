#!/usr/bin/env node

const [command, ...extraArguments] = process.argv.slice(2)

if (!command || command === '--help' || command === '-h') {
  printHelp()
  process.exit(0)
}

switch (command) {
  case 'apply-passwordless-flow':
    if (extraArguments.length > 0) {
      console.error('apply-passwordless-flow does not accept arguments; configure it with environment variables.')
      process.exit(1)
    }
    await import('../admin/apply-passwordless-flow.mjs')
    break
  case 'check-passwordless':
    if (extraArguments.length > 0) {
      console.error('check-passwordless does not accept arguments; configure it with environment variables.')
      process.exit(1)
    }
    await import('../admin/check-passwordless.mjs')
    break
  case 'cleanup-unverified-users':
    process.env.CASELAW_UNVERIFIED_CLEANUP_ARGUMENTS = JSON.stringify(extraArguments)
    await import('../admin/cleanup-unverified-users.mjs')
    break
  default:
    console.error(`Unknown command: ${command}`)
    printHelp()
    process.exit(1)
}

function printHelp() {
  console.log(`caselaw-auth administration commands

Usage:
  caselaw-auth apply-passwordless-flow
  caselaw-auth check-passwordless
  caselaw-auth cleanup-unverified-users [--max-age-days DAYS] [--execute]

Required environment variables:
  KEYCLOAK_ADMIN
  KEYCLOAK_ADMIN_PASSWORD

Optional environment variables:
  KEYCLOAK_URL                       default: http://localhost:8080
  KEYCLOAK_REALM                     default: caselaw
  KEYCLOAK_ADMIN_REALM               default: master
  CASELAW_PASSWORDLESS_ESTATE_MODE   default: true only for the caselaw realm

Safety:
  check-passwordless is read-only and verifies the flow, SMTP configuration,
  user profile and (in estate mode) clients.
  cleanup-unverified-users is a dry run unless --execute is supplied. It only
  selects old, unverified, email-only users without credentials or names.
`)
}
