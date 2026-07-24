# caselaw-auth

Shared OIDC auth client and framework adapters for Case Law Explorer projects.

The package is provider-neutral. It works with the central Keycloak service
because Keycloak exposes standard OIDC endpoints.

## Install

```sh
npm install caselaw-auth
```

## Core Client

```ts
import { createAuthClient } from 'caselaw-auth'

const auth = createAuthClient({
  issuer: 'https://auth.caselawexplorer.tech/realms/caselaw',
  clientId: 'caselaw-frontend',
  redirectUri: `${window.location.origin}/auth/callback`,
})
```

## Svelte

```ts
import { createSvelteAuth } from 'caselaw-auth/svelte'

export const auth = createSvelteAuth({
  issuer: 'https://auth.caselawexplorer.tech/realms/caselaw',
  clientId: 'caselaw-frontend',
  redirectUri: `${window.location.origin}/auth/callback`,
})
```

```svelte
<script lang="ts">
  import { auth } from '$lib/auth'
</script>

{#if $auth.isAuthenticated}
  <button on:click={() => auth.logout('/')}>Logout</button>
{:else}
  <button on:click={() => auth.login()}>Login</button>
{/if}
```

## Vue / Nuxt

```ts
import { createCaselawAuthPlugin } from 'caselaw-auth/vue'
import 'caselaw-auth/vue/style.css'

app.use(createCaselawAuthPlugin({
  issuer: 'https://auth.caselawexplorer.tech/realms/caselaw',
  clientId: 'caselaw-frontend',
  redirectUri: `${window.location.origin}/auth/callback`,
}))
```

Available Vue exports:

- `createCaselawAuthPlugin`
- `useAuth`
- `useAuthState`
- `AuthGate`
- `LoginButton`
- `LogoutButton`
- `AccountMenu`
- `CallbackView`
