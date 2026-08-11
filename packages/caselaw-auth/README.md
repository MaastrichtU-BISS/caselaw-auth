# caselaw-auth

Browser OIDC client for the Case Law Explorer products. Authorization code flow with
PKCE, token refresh, role checks, and adapters for Vue and Svelte.

Provider-neutral. It is used with the shared
[Keycloak realm](https://github.com/MaastrichtU-BISS/caselaw-auth) because Keycloak
speaks standard OIDC, but any compliant provider works.

```bash
npm install caselaw-auth
```

## The core client

```ts
import { createAuthClient } from "caselaw-auth";

const auth = createAuthClient({
  issuer: "https://auth.example.org/realms/caselaw",
  clientId: "my-product",
  redirectUri: `${location.origin}/auth/callback`,
  postLogoutRedirectUri: location.origin,
  storageKey: "myproduct:auth",
});

const session = auth.getSession();
if (!session) {
  await auth.login({ returnTo: location.pathname });
}
```

Methods: `getSession`, `setSession`, `clearSession`, `login`, `logout`,
`handleCallback`, `refresh`, `shouldRefresh`, `hasRole`, `hasAnyRole`, `discover`.

### The session

```ts
type AuthSession = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;       // epoch milliseconds
  scope?: string;
  user: AuthUser;          // sub, email, name, preferredUsername, roles
};
```

### The callback route

Every application needs one route matching its `redirectUri`. It calls
`handleCallback()` and sends the user on:

```ts
// /auth/callback
const session = await auth.handleCallback();
location.replace("/");
```

`login({ returnTo })` round-trips the path, so a deep link survives sign-in.

### Roles

```ts
if (auth.hasRole("admin")) {
  // show the console
}

auth.hasAnyRole(["admin", "curator"]);
```

Roles come from the access token, covering both realm roles and roles for this client.

## Vue

Install the plugin once:

```ts
import { createCaselawAuthPlugin } from "caselaw-auth/vue";

const { install } = createCaselawAuthPlugin({
  issuer: "https://auth.example.org/realms/caselaw",
  clientId: "my-product",
  redirectUri: `${location.origin}/auth/callback`,
});

createApp(App).use({ install }).mount("#app");
```

Then use it from any component:

```vue
<script setup>
import { useAuth, useAuthInit, useAuthState } from "caselaw-auth/vue";

const auth = useAuth();
const { ready, isAuthenticated, user, error } = useAuthState();

useAuthInit();   // restores the session, or completes a callback
</script>

<template>
  <p v-if="!ready">Checking your session…</p>
  <button v-else-if="!isAuthenticated" @click="auth.login()">Sign in</button>
  <template v-else>
    <p>Signed in as {{ user.email }}</p>
    <button @click="auth.logout()">Sign out</button>
  </template>
  <p v-if="error">{{ error.message }}</p>
</template>
```

`useAuth()` returns `client`, `state`, `init`, `login`, `handleCallback`, `logout`,
`refresh`, `hasRole`, `hasAnyRole` and `requireRole`.

`useAuthState()` returns reactive `status`, `ready`, `session`, `user`, `error` and
`isAuthenticated`.

An optional stylesheet ships for the sign-in surfaces:

```ts
import "caselaw-auth/vue/style.css";
```

## Svelte

```svelte
<script>
  import { createSvelteAuth } from "caselaw-auth/svelte";

  const auth = createSvelteAuth({
    issuer: "https://auth.example.org/realms/caselaw",
    clientId: "my-product",
    redirectUri: `${location.origin}/auth/callback`,
  });

  auth.init();
</script>

{#if !$auth.ready}
  <p>Checking your session…</p>
{:else if !$auth.session}
  <button on:click={() => auth.login()}>Sign in</button>
{:else}
  <p>Signed in as {$auth.session.user.email}</p>
{/if}
```

`createSvelteAuth` returns a readable store plus `init`, `login`, `logout` and
`hasRole`.

## Configuration

| Option | Required | Meaning |
|---|---|---|
| `issuer` | yes | Realm URL. Discovery is read from `/.well-known/openid-configuration` |
| `clientId` | yes | The public client in that realm |
| `redirectUri` | yes | Has to match a valid redirect URI on the client exactly |
| `postLogoutRedirectUri` | no | Where sign-out lands. Defaults to the origin |
| `storageKey` | no | localStorage key for the session |
| `scope` | no | Defaults to `openid profile email` |

Give every product a distinct `storageKey`. Two applications on one origin sharing a
key overwrite each other's sessions.

## Access tokens are short

Keycloak issues access tokens with a five minute lifetime by default. The client
refreshes automatically, so this rarely shows in the browser. It shows when you copy a
token out for a script: it expires quickly, and a 401 a few minutes later means the
token aged rather than anything being misconfigured.

For the same reason, do not store an access token in a cookie alongside anything else
of size. Two Keycloak tokens past roughly 2,900 characters combined exceed the 4096
bytes a browser will hold for one cookie, and the browser discards it silently.

## Related

- [caselaw-auth](https://github.com/MaastrichtU-BISS/caselaw-auth), the realm, themes and deployment
- [caselaw-access](https://github.com/MaastrichtU-BISS/caselaw-access), which validates these tokens for API access
