import { createAdminClient, fail } from './keycloak-admin.mjs'

try {
  const options = parseArguments(JSON.parse(process.env.CASELAW_UNVERIFIED_CLEANUP_ARGUMENTS || '[]'))
  const client = await createAdminClient()
  const cutoff = Date.now() - options.maxAgeDays * 24 * 60 * 60 * 1000
  const users = await allUsers(client)
  const candidates = []

  for (const user of users) {
    if (!isPendingUserShape(user, cutoff)) continue
    // Keycloak's paginated user list is a brief representation and can omit
    // custom attributes. Fetch the exact record before checking provenance.
    const detailed = await client.api('GET', `/users/${encodeURIComponent(user.id)}`)
    if (!attributeIncludes(detailed, 'caselaw.pending-email-otp', 'true')) continue
    const credentials = await client.api('GET', `/users/${encodeURIComponent(user.id)}/credentials`)
    if (credentials.length === 0) candidates.push(detailed)
  }

  for (const user of candidates) {
    const ageDays = Math.floor((Date.now() - user.createdTimestamp) / (24 * 60 * 60 * 1000))
    console.log(`${options.execute ? 'DELETE' : 'WOULD DELETE'} ${user.email} (${ageDays} days old, id ${user.id})`)
    if (options.execute) await client.api('DELETE', `/users/${encodeURIComponent(user.id)}`)
  }

  console.log(`${options.execute ? 'Deleted' : 'Dry run: found'} ${candidates.length} unverified email-only user(s) older than ${options.maxAgeDays} day(s).`)
  if (!options.execute) console.log('Run again with --execute only after reviewing this list.')
} catch (error) {
  fail(error)
}

function parseArguments(args) {
  let execute = false
  let maxAgeDays = Number(process.env.CASELAW_UNVERIFIED_MAX_AGE_DAYS || 7)
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--execute') {
      execute = true
    } else if (argument === '--max-age-days') {
      maxAgeDays = Number(args[index + 1])
      index += 1
    } else {
      throw new Error(`Unknown cleanup argument: ${argument}`)
    }
  }
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    throw new Error('--max-age-days must be a non-negative number.')
  }
  return { execute, maxAgeDays }
}

async function allUsers(client) {
  const users = []
  const pageSize = 100
  for (let first = 0; ; first += pageSize) {
    const page = await client.api('GET', `/users?first=${first}&max=${pageSize}`)
    users.push(...page)
    if (page.length < pageSize) return users
  }
}

function isPendingUserShape(user, cutoff) {
  const email = user.email?.trim().toLowerCase()
  return Boolean(
    user.id
    && email
    && user.username?.trim().toLowerCase() === email
    && user.emailVerified === false
    && Number.isFinite(user.createdTimestamp)
    && user.createdTimestamp < cutoff
    && !user.firstName
    && !user.lastName
    && !user.federationLink
    && !user.serviceAccountClientId
    && (!user.requiredActions || user.requiredActions.length === 0)
  )
}

function attributeIncludes(user, name, expected) {
  const value = user.attributes?.[name]
  return Array.isArray(value) ? value.includes(expected) : value === expected
}
