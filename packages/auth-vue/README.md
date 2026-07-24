# @caselaw/auth-vue

Reusable OIDC auth package for Vue 3 and Nuxt projects.

The package intentionally depends on generic OIDC settings, not Keycloak-only
APIs. Keycloak is the current provider, but consuming projects only need issuer,
client ID, and callback URL configuration.

## Install

```sh
npm install @caselaw/auth-vue
```

Until the package is published to a registry, install it from this repository
as a workspace or file dependency:

```json
{
  "dependencies": {
    "@caselaw/auth-vue": "file:../caselaw-auth/packages/auth-vue"
  }
}
```

For production cross-project reuse, publish `packages/auth-vue` to GitHub
Packages or a private npm registry and pin versions in consuming apps.

## Vue

```ts
import { createApp } from 'vue'
import {
  AccountMenu,
  AuthGate,
  CallbackView,
  createCaselawAuthPlugin,
} from '@caselaw/auth-vue'
import '@caselaw/auth-vue/style.css'
import App from './App.vue'

const auth = createCaselawAuthPlugin({
  issuer: import.meta.env.VITE_AUTH_ISSUER,
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID,
  redirectUri: import.meta.env.VITE_AUTH_REDIRECT_URI,
  postLogoutRedirectUri: window.location.origin,
})

const app = createApp(App)
app.use(auth)
app.component('AuthGate', AuthGate)
app.component('CallbackView', CallbackView)
app.component('AccountMenu', AccountMenu)
app.mount('#app')
```

Create a callback route that renders:

```vue
<template>
  <CallbackView />
</template>
```

Protect an area:

```vue
<template>
  <AuthGate :required-roles="['researcher']">
    <RouterView />
  </AuthGate>
</template>
```

## Nuxt

Create `plugins/auth.client.ts`:

```ts
import { createCaselawAuthPlugin } from '@caselaw/auth-vue'
import '@caselaw/auth-vue/style.css'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const auth = createCaselawAuthPlugin({
    issuer: config.public.authIssuer,
    clientId: config.public.authClientId,
    redirectUri: config.public.authRedirectUri,
    postLogoutRedirectUri: window.location.origin,
  })

  nuxtApp.vueApp.use(auth)
  return {
    provide: {
      auth: auth.auth,
    },
  }
})
```

Configure:

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      authIssuer: process.env.NUXT_PUBLIC_AUTH_ISSUER,
      authClientId: process.env.NUXT_PUBLIC_AUTH_CLIENT_ID,
      authRedirectUri: process.env.NUXT_PUBLIC_AUTH_REDIRECT_URI,
    },
  },
})
```

Create `pages/auth/callback.vue`:

```vue
<script setup lang="ts">
import { CallbackView } from '@caselaw/auth-vue'
</script>

<template>
  <CallbackView />
</template>
```

Protect a page:

```vue
<script setup lang="ts">
import { AuthGate } from '@caselaw/auth-vue'
</script>

<template>
  <AuthGate :required-roles="['researcher']">
    <NuxtPage />
  </AuthGate>
</template>
```

## Environment

For Keycloak:

```env
VITE_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
VITE_AUTH_CLIENT_ID=<project-client-id>
VITE_AUTH_REDIRECT_URI=https://<project-domain>/auth/callback
```

Nuxt public runtime variables:

```env
NUXT_PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
NUXT_PUBLIC_AUTH_CLIENT_ID=<project-client-id>
NUXT_PUBLIC_AUTH_REDIRECT_URI=https://<project-domain>/auth/callback
```

## API Calls

Use the access token for APIs that trust the shared auth service:

```ts
import { useAuth } from '@caselaw/auth-vue'

const auth = useAuth()
const response = await fetch('/api/me', {
  headers: {
    Authorization: `Bearer ${auth.state.session?.accessToken}`,
  },
})
```

For Caselaw specifically, we can keep the existing server-side `API_TOKEN`
proxy while the API is migrated to trust OIDC JWTs.
