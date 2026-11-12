export function envBoolean(name, fallback = false) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  if (['true', '1', 'yes'].includes(raw.toLowerCase())) return true
  if (['false', '0', 'no'].includes(raw.toLowerCase())) return false
  throw new Error(`${name} must be true or false.`)
}

export async function createAdminClient() {
  const baseUrl = (process.env.KEYCLOAK_URL || 'http://localhost:8080').replace(/\/$/, '')
  const realm = process.env.KEYCLOAK_REALM || 'caselaw'
  const adminRealm = process.env.KEYCLOAK_ADMIN_REALM || 'master'
  const username = process.env.KEYCLOAK_ADMIN || ''
  const password = process.env.KEYCLOAK_ADMIN_PASSWORD || ''

  if (!username || !password) {
    throw new Error('Set KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD.')
  }

  const tokenResponse = await fetch(
    `${baseUrl}/realms/${encodeURIComponent(adminRealm)}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username,
        password,
      }),
    },
  )

  if (!tokenResponse.ok) {
    throw new Error(`Could not get an admin token from ${baseUrl} (${tokenResponse.status}).`)
  }
  const { access_token: token } = await tokenResponse.json()
  if (!token) throw new Error('Keycloak returned an empty admin token.')

  const adminPath = `/admin/realms/${encodeURIComponent(realm)}`
  return {
    baseUrl,
    realm,
    async api(method, suffix = '', body) {
      const response = await fetch(`${baseUrl}${adminPath}${suffix}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const raw = await response.text()
      if (!response.ok) {
        throw new Error(`${method} ${suffix || '/'} failed (${response.status}): ${raw || response.statusText}`)
      }
      return raw ? JSON.parse(raw) : undefined
    },
  }
}

export function fail(error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
