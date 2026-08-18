# caselaw-auth

OIDC for the Case Law Explorer products, in two halves: a browser client
(authorization code with PKCE, refresh, role checks, Vue and Svelte adapters) and
a server one that keeps the session out of the browser entirely.

Provider-neutral. It is used with the shared
[Keycloak realm](https://github.com/MaastrichtU-BISS/caselaw-auth) because Keycloak
speaks standard OIDC, but any compliant provider works.

```bash
npm install caselaw-auth
```

## Which half

**If your application has a server, use `caselaw-auth/server`.** The session becomes
an httpOnly cookie that page script cannot read, rather than a `localStorage` entry it
can — and `localStorage` holds the refresh token, which is the credential worth
stealing. This is the backend-for-frontend shape the OAuth 2.0 Security BCP describes
and what Keycloak's own guidance recommends wherever there is a server to put a
session on. Jump to [The server](#the-server).

**Use the browser client when there is no server** — a static SPA talking directly to
an API. It is the correct shape for that, and PKCE plus refresh-token rotation is the
recommended hardening. Pair it with a Content-Security-Policy: with the session in
`localStorage`, one XSS is one stolen refresh token.

Some things only the server half can do at all. Anything holding a shared secret —
DiscourseConnect, for instance — is impossible in a browser, because a browser cannot
keep one.

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

## The server

`caselaw-auth/server` is framework-neutral and dependency-free — Web Crypto and
`fetch` only — so it runs on Node 18+, Astro's node and serverless adapters, Deno and
workers. It imports no router and reads no environment.

```ts
import { createServerAuth, createPkcePair, randomToken } from "caselaw-auth/server";

const auth = createServerAuth({
  issuer: process.env.AUTH_ISSUER,          // .../realms/caselaw
  clientId: process.env.AUTH_CLIENT_ID,
  clientSecret: process.env.AUTH_CLIENT_SECRET,   // confidential clients only
  redirectUri: process.env.AUTH_REDIRECT_URI,
  sessionSecret: process.env.AUTH_SESSION_SECRET, // signs the cookie
});
```

Three routes. Start one:

```ts
const { verifier, challenge } = await createPkcePair();
const state = randomToken();
// state and verifier must survive the round trip and stay unreadable by page
// script — a short httpOnly cookie, not sessionStorage.
setCookie("auth_tx", await auth.sealSession({ …, state, verifier }, "auth_tx"),
          auth.cookieOptions(600));
redirect(await auth.authorizationUrl({ state, codeChallenge: challenge }));
```

Finish it:

```ts
const tx = await auth.unsealSession(getCookie("auth_tx"));
if (!tx || tx.state !== url.searchParams.get("state")) return bad();  // CSRF, or a stale tab

const tokens = await auth.exchangeCode({ code, codeVerifier: tx.verifier });
const claims = await auth.verifyToken(tokens.access_token);
const session = auth.sessionFromClaims(claims, { idToken: tokens.id_token });
setCookie("caselaw_session", await auth.sealSession(session), auth.cookieOptions(8 * 3600));
```

Read it on any request — an HMAC check, no network call:

```ts
const session = await auth.unsealSession(getCookie("caselaw_session"));
if (!session?.roles.includes("admin")) return forbidden();
```

End it. `id_token_hint` is what makes this a real single sign-out; without it Keycloak
keeps its own session and the next sign-in completes with no prompt:

```ts
redirect(await auth.endSessionUrl({ idToken: session?.idToken, returnTo: site }));
```

### What it decides for you

- **`sessionFromClaims` does not keep the access token.** It copies the roles out and
  drops it. Keep one only if something calls an API as the user — and then in its own
  cookie, for the size reason above.
- **The session has its own TTL**, not the token's few minutes, so session length is
  not hostage to clock drift between machines.
- **`sealSession` throws above 4096 bytes** rather than handing back a cookie the
  browser will silently discard.
- **Cookies are `httpOnly`, `secure`, `sameSite=lax`** — not `strict`, which would drop
  the cookie on the redirect back from the provider.
- **`verifyToken` does not check `aud` by default.** Keycloak puts `account` there for
  a public client's access token and names the client in `azp`, so checking `aud`
  rejects every valid token. Pass `azp` instead.
- **JWKS is cached and retried once**, because a blip on the refetch would otherwise
  fail a request with nothing wrong with it.

Full walkthrough, the Keycloak client to create, and DiscourseConnect end to end:
[docs/SERVER_SIDE_AUTH.md](https://github.com/MaastrichtU-BISS/caselaw-auth/blob/main/docs/SERVER_SIDE_AUTH.md).

## Related

- [caselaw-auth](https://github.com/MaastrichtU-BISS/caselaw-auth), the realm, themes and deployment
- [caselaw-access](https://github.com/MaastrichtU-BISS/caselaw-access), which validates these tokens for API access
