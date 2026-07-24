# @caselaw/auth-client

Framework-neutral OIDC Authorization Code + PKCE client for Case Law Explorer
projects.

Use this package from SvelteKit, plain TypeScript, or any frontend that should
not import Vue/Nuxt-specific code.

## Configure

```ts
import { createAuthClient } from '@caselaw/auth-client'

export const auth = createAuthClient({
  issuer: 'https://auth.caselawexplorer.tech/realms/caselaw',
  clientId: 'caselaw-frontend',
  redirectUri: `${window.location.origin}/auth/callback`,
  postLogoutRedirectUri: window.location.origin,
})
```

## Login

```ts
await auth.login({ returnTo: '/account' })
```

## Callback

```ts
const session = await auth.handleCallback()
```

## API Calls

```ts
const session = auth.getSession()

await fetch('/api/me', {
  headers: {
    Authorization: `Bearer ${session?.accessToken}`,
  },
})
```

For the main Caselaw frontend, keep using the server-side `API_TOKEN` proxy
until the API has been migrated to trust OIDC JWTs directly.
