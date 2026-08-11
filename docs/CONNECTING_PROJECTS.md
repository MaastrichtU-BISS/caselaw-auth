# Connecting a project to Case Law Auth

For anyone at BISS adding sign-in to a product against the **hosted** service at
`https://auth.caselawexplorer.tech`. You do not need to run Keycloak, read the
realm file, or understand OIDC to follow this.

Case Law Explorer is used throughout as the worked example, because it is real
and you can read its source.

**Time:** about an hour for a frontend, another for an API.
**You will need:** realm-admin access to the Keycloak console (ask an existing
admin), and a domain for your product.

**On a realm that is not `caselaw`** — your own, or a staging one — everything
below is unchanged except the issuer, which becomes
`https://<keycloak-host>/realms/<realm-name>`. The client library discovers
every endpoint from it and neither knows nor cares which realm answers. Setting
that realm up is [REALM_SETUP.md](REALM_SETUP.md).

---

## What you get, and what you do not

Keycloak answers **who someone is**. It gives you a verified identity — a
stable `sub`, an email, a name, and a set of roles — shared across every Case
Law product, so a person signs in once.

It does not answer **what they may do** beyond coarse roles. Plans, quotas, API
keys and per-endpoint permissions live in
[caselaw-access](https://github.com/MaastrichtU-BISS/caselaw-access). If your
product needs rate limiting or API keys, you want both services, and you should
read that repository's docs after this one.

You also do not have to use it. Every product treats sign-in as optional: the
Citations API runs without it, and the research workspace has a `none` provider
so it can run locally with no identity service at all. Build that escape hatch
in from the start — it is what makes your app runnable in CI and on a laptop.

---

## Decide these three things first

Everything below follows from them.

**1. Your client ID.** One per application, lowercase and hyphenated. The
existing ones are `caselaw-frontend`, `caselaw-api`, `caselaw-access`,
`caselaw-db-workbench`. Pick something a stranger can map to your product.

**2. Public or confidential.** If the code that holds the secret runs in a
browser, it is **public** — a browser cannot keep a secret, and the flow is
designed so it does not need to. Choose confidential only when a server does
the sign-in, or when you need machine-to-machine tokens with no user involved.
Nearly every product here is public.

**3. Your callback URL.** Conventionally `https://<your-domain>/auth/callback`.
It must be a real route in your app that renders something, not a placeholder.

---

## Step 1 — Create the Keycloak client

In the admin console at `https://auth.caselawexplorer.tech/admin`, realm
**`caselaw`**, go to **Clients → Create client**.

### Public client (browser apps — the usual case)

| Setting | Value |
|---|---|
| Client ID | your client ID from above |
| Client authentication | **Off** |
| Standard flow | **On** |
| Direct access grants | **Off** |
| Service accounts roles | **Off** |
| Valid redirect URIs | `https://your-domain/auth/callback` *and* `http://localhost:5173/auth/callback` |
| Valid post logout redirect URIs | `+` |
| Web origins | `+` |
| PKCE method (Advanced tab) | `S256` |

Four of those are the ones people get wrong:

**Direct access grants off.** That flow trades a username and password for a
token directly. Leaving it on means anyone who can reach Keycloak can attempt
passwords against it without ever loading your login page.

**`+` for post logout redirect URIs** reuses the sign-in list. Keycloak
validates where sign-out returns to *separately*, and the failure appears after
the session has already ended — so the user is signed out, looking at an error,
on a page you did not write.

**`+` for web origins** derives CORS origins from the redirect URIs, so the two
cannot drift apart.

**PKCE `S256`.** Without it, a public client's authorization code can be
intercepted and redeemed by something else. `caselaw-auth` always sends the
PKCE challenge; setting this makes Keycloak *require* it.

Add the localhost URI now. It costs nothing and you will otherwise add it in a
hurry, later, while trying to debug something else.

### Confidential client (server-side or machine-to-machine)

Same, except **Client authentication: On**, and:

- **Standard flow** on only if a user actually signs in through it.
- **Service accounts roles** on only for machine-to-machine calls with no user.
- Copy the secret from the **Credentials** tab into your server's environment.
  It never goes near a browser, a build arg, or a `PUBLIC_` variable.

`caselaw-access-admin` is the estate's example: service accounts on, standard
flow off, holding realm-management roles so the access service can read the
user directory.

---

## Step 2 — Environment variables

### Frontend

Four variables, same shape in every product:

```env
PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
PUBLIC_AUTH_CLIENT_ID=your-client-id
PUBLIC_AUTH_REDIRECT_URI=https://your-domain/auth/callback
PUBLIC_AUTH_STORAGE_KEY=yourproduct:auth
```

The issuer is identical across products. The client ID and storage key are not.

**On the storage key:** it names the localStorage entry holding the session.
Browsers scope localStorage per origin, so two products on different domains
cannot collide — but give it a distinct value anyway. It costs nothing, and it
saves you when two apps end up behind one origin on different paths, which is
exactly the situation where the bug is baffling.

The `PUBLIC_` prefix is a convention with teeth: these values reach the
browser, so nothing secret may ever be named this way. There is no secret here
— an issuer, a client ID and a URL are all public by design.

**Build-time versus runtime matters and has bitten this estate.** SvelteKit's
`$env/static/public` and Nuxt's build-time config **bake values into the
bundle**, so changing them in a deployment panel does nothing until you rebuild.
Case Law Explorer reads auth config through `$env/dynamic/public` precisely so
the deployed app can be repointed at a different issuer without a rebuild. If
your framework offers the choice, take the dynamic one.

### Backend

An API that verifies tokens needs only the issuer:

```env
AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
```

No `PUBLIC_` prefix — this is server-side. Everything else (the signing keys,
the endpoints) is discovered from it. A confidential client adds
`AUTH_CLIENT_ID` and `AUTH_CLIENT_SECRET`; a token-verifying API needs neither.

---

## Step 3 — Frontend code

```bash
npm install caselaw-auth
```

One package, three entry points. `caselaw-auth/client` is framework-neutral,
`caselaw-auth/vue` and `caselaw-auth/svelte` wrap it. Vue and Svelte are
optional peer dependencies, so installing this does not drag in a framework you
are not using.

### Vue and Nuxt

Register the plugin once:

```ts
// plugins/auth.client.ts
import { createCaselawAuthPlugin } from "caselaw-auth/vue";

export default defineNuxtPlugin((nuxtApp) => {
  const plugin = createCaselawAuthPlugin({
    issuer: config.auth.issuer,
    clientId: config.auth.clientId,
    redirectUri: config.auth.redirectUri,
    postLogoutRedirectUri: config.auth.postLogoutRedirectUri,
    storageKey: config.auth.storageKey,
    requiredRoles: ["admin"],   // optional; see Step 5
  });

  nuxtApp.vueApp.use(plugin);
  return { provide: { caselawAuth: plugin.auth } };
});
```

Note the `.client.ts` suffix. This is browser-only — it touches `localStorage`
and `window`, and running it during SSR throws.

Then in components:

```vue
<script setup lang="ts">
import { useAuth, useAuthState } from "caselaw-auth/vue";

const auth = useAuth();
const { user, isAuthenticated, ready, status } = useAuthState();
</script>

<template>
  <p v-if="!ready">Loading…</p>
  <p v-else-if="isAuthenticated">Welcome, {{ user?.name }}</p>
  <button v-else @click="auth.login()">Sign in</button>
</template>
```

`useAuthState()` returns computed refs — `status`, `ready`, `session`, `user`,
`error`, `isAuthenticated`. **Always branch on `ready` before `isAuthenticated`.**
Until the client has restored and possibly refreshed the stored session, a
signed-in user reads as anonymous, and a guard that skips this check bounces
them to the login page on every page load.

Ready-made components, all from `caselaw-auth/vue`:

| Component | Props |
|---|---|
| `AuthGate` | `title`, `message`, `requiredRoles` |
| `LoginButton` | `label`, `returnTo` |
| `LogoutButton` | `label`, `returnTo` |
| `AccountMenu` | — the signed-in identity as a menu |
| `CallbackView` | — body for the callback route |

They carry styles:

```ts
import "caselaw-auth/vue/style.css";
```

Two things about `AuthGate` worth knowing before you wrap a layout in it. It
**calls `init()` itself** on mount, so you do not also need `useAuthInit()`. And
it renders four different ways — the default slot when signed in and
role-checked, and named `loading`, `forbidden` and `anonymous` slots you can
override. Leaving `requiredRoles` empty means any signed-in user passes, not
nobody.

`CallbackView` **does not navigate anywhere** when it finishes. It completes the
exchange and shows a spinner, or an error with a retry button. Sending the user
onward afterwards is still yours to write.

If your framework auto-imports components by filename — Nuxt does — a local
`components/AuthGate.vue` will silently shadow the package's. That is how
caselaw-access ends up with its own, and it is a deliberate choice there rather
than an accident, but it is worth knowing before you spend an afternoon
wondering why a prop has no effect.

### SvelteKit

```ts
import { createSvelteAuth } from "caselaw-auth/svelte";

export const auth = createSvelteAuth({
  issuer: env.PUBLIC_AUTH_ISSUER,
  clientId: env.PUBLIC_AUTH_CLIENT_ID,
  redirectUri: env.PUBLIC_AUTH_REDIRECT_URI ?? `${location.origin}/auth/callback`,
  postLogoutRedirectUri: location.origin,
  storageKey: env.PUBLIC_AUTH_STORAGE_KEY ?? "caselaw:frontend:auth",
});
```

`state`, `session`, `user` and `isAuthenticated` are Svelte stores, so `$user`
works in markup. Methods match the Vue adapter: `init`, `login`,
`handleCallback`, `logout`, `refresh`, `hasRole`, `hasAnyRole`.

Guard construction behind `browser` — `createAuthClient` reaches for
`localStorage`. Case Law Explorer's `app/src/lib/auth/oidc.ts` does this, and
returns `null` when the issuer is unset so the app runs unconfigured rather
than crashing.

### The callback route — the step people forget

You must have a route at your redirect URI that calls `handleCallback()`. Until
it does, sign-in appears to work, the password is accepted, and the user lands
on a blank page holding an authorization code nobody redeemed.

```vue
<!-- pages/auth/callback.vue -->
<script setup lang="ts">
import { useAuth } from "caselaw-auth/vue";
const auth = useAuth();
onMounted(async () => {
  const session = await auth.handleCallback();
  await navigateTo(session ? "/" : "/");
});
</script>
```

`handleCallback()` exchanges the code, stores the session and returns it.
Afterwards, send the user to `returnTo` if you passed one to `login()`.

### Neither adapter, or another framework

```ts
import { createAuthClient } from "caselaw-auth/client";

const auth = createAuthClient({ issuer, clientId, redirectUri });

let session = auth.getSession();
if (auth.shouldRefresh(session)) session = await auth.refresh();
if (!session) await auth.login({ returnTo: location.pathname });
```

Full surface: `login`, `logout`, `handleCallback`, `refresh`, `getSession`,
`setSession`, `clearSession`, `shouldRefresh`, `hasRole`, `hasAnyRole`,
`discover`.

### Calling your own API

Send the access token as a bearer token:

```ts
const session = auth.getSession();
await fetch("/api/things", {
  headers: { Authorization: `Bearer ${session.accessToken}` },
});
```

Read it from the client each time rather than copying it into a variable at
startup. Access tokens expire in about five minutes; the client refreshes in
the background, and a copy taken once goes stale and starts producing 401s that
look like a server fault.

---

## Step 4 — Backend code

Your API must verify the token itself. Never trust a client-supplied user id,
and never call Keycloak per request to ask about a token — the signature is
verifiable offline against the realm's published keys.

Four things to check, in order:

1. **Signature**, against the realm's JWKS at
   `<issuer>/protocol/openid-connect/certs`.
2. **Issuer** matches exactly.
3. **Expiry** — every JWT library does this by default; do not switch it off.
4. **Roles**, if the route needs one.

Python, as caselaw-access does it in `app/auth.py`:

```python
import jwt
from jwt import PyJWKClient

jwks = PyJWKClient(f"{ISSUER}/protocol/openid-connect/certs")

def verify(token: str) -> dict:
    key = jwks.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        key,
        algorithms=["RS256", "RS384", "RS512", "ES256"],
        issuer=ISSUER,
        options={"verify_aud": False},
    )
```

**Why `verify_aud: False`.** Keycloak does not put your client ID in `aud` for
a public client's access token — it puts `account`, and identifies the
requesting client in `azp` instead. Verifying the audience therefore rejects
every valid token, which reads as "my tokens are broken". If you want that
check, assert on `azp` instead.

**Cache the JWKS client, and retry once.** Fetching the key set per request
adds a round trip to your identity provider on every call. caselaw-access
caches it — and then had to add a single retry, because the cache expires every
few minutes and one blip on that refetch turned a filled-in form into a bare
503. Retry once against a fresh client; if the token itself is bad, do not
retry, because it will say the same thing twice.

Distinguish the two failures in what you return: a bad token is **401**, an
unreachable identity provider is **503**. Collapsing them sends users to
re-authenticate during an outage, which cannot help and doubles the load.

### Roles from the claims

```python
realm_roles  = claims.get("realm_access", {}).get("roles", [])
client_roles = claims.get("resource_access", {}).get("your-client-id", {}).get("roles", [])
```

`caselaw-auth` flattens both for you on the frontend: `user.roles` and
`user.clientRoles`. On the backend you read them yourself.

---

## Step 5 — Roles

`admin` is the only role the shared platform reads. It gates the access
console, the database workbench, and administrator routes in the access
service. Assign it under **Users → Role mapping**; realm role or client role,
the browser client reads both.

Define your own product roles as **client roles** on your own client. A realm
role is visible to every product in the estate and is a claim about the person
across all of them; a client role says something about them in your product
only. When in doubt, client role.

Two ways to enforce on the frontend, and they are not equivalent:

```ts
requiredRoles: ["admin"]        // in the config — the client's own check
```

```vue
<AuthGate :required-roles="['admin']">…</AuthGate>
```

Both are **user-experience**, not security. Anyone can edit what runs in their
own browser. Every route that exposes anything sensitive must check the role
again on the server, from the verified token. The frontend check exists so
people are not shown doors they cannot open.

---

## Step 6 — Test it

Do these in order. Each catches a distinct failure.

- [ ] Sign in from the deployed domain.
- [ ] Sign in from `localhost`.
- [ ] **Reload while signed in.** Catches a missing `ready` check and a wrong storage key.
- [ ] **Sign out, then confirm you are actually signed out** — reload and check you are not silently back in.
- [ ] **Wait past five minutes and make an API call.** Catches a copied-once token and a broken refresh.
- [ ] Call your API with no token: expect 401.
- [ ] Call it with a deliberately corrupted token: expect 401, not 500.
- [ ] Confirm the expected roles are in the token (paste it into jwt.io — decoding is offline).
- [ ] Open the browser console during the callback and confirm no CORS error.

---

## Worked example: Case Law Explorer

The whole estate, end to end.

**Keycloak** — realm `caselaw`, three public browser clients:
`caselaw-frontend` (the research workspace), `caselaw-access` (the console) and
`caselaw-db-workbench`. Plus `caselaw-api`, which is the other shape entirely:
confidential, standard flow off, service accounts on, no redirect URIs. It
never signs a person in; it obtains tokens as itself.

The realm file is a seed, not a mirror of the running instance — anything added
through the admin console lives in Keycloak's database until someone exports it
back, so the live realm may hold clients this file does not.

**The research workspace** (SvelteKit) builds its client in
`app/src/lib/auth/oidc.ts` behind a `browser` guard, reading
`PUBLIC_AUTH_ISSUER` / `PUBLIC_AUTH_CLIENT_ID` / `PUBLIC_AUTH_REDIRECT_URI` /
`PUBLIC_AUTH_STORAGE_KEY` from `$env/dynamic/public`, with storage key
`caselaw:frontend:auth`. When the issuer is unset it returns `null` and the app
runs signed-out — which is how `FRONTEND_AUTH_PROVIDER=none` works locally.

**The access console** (Nuxt) registers `createCaselawAuthPlugin` in
`ui/plugins/auth.client.ts`, fetching issuer and client ID from its own
`/v1/config` at runtime rather than baking them in — which is why it can be
repointed at another realm without a rebuild. Its account area is a single gate
wrapping the layout in `ui/layouts/account.vue`; that one is its own
`ui/components/AuthGate.vue`, not the package's, with an `auto-sign-in` prop
that skips the prompt and redirects straight to Keycloak.

**The access service** (FastAPI) verifies tokens in `app/auth.py` exactly as in
Step 4 — cached JWKS, one retry, `verify_aud: False`, 401 versus 503 kept
apart.

**The Citations API** holds no auth code at all. It delegates to the access
service through `caselaw-access-client`, which validates the credential and
meters the call in one request. That is the pattern to copy if your product
needs quotas: verify identity here, ask access what the caller may do.

---

## Troubleshooting

**`invalid_redirect_uri` after the password is accepted.** The URI does not
match a registered one *exactly*. Trailing slashes count; `http` and `https`
count; a port counts.

**"Invalid redirect uri" when signing out.** Post-logout URIs are a separate
list. Set it to `+`.

**Blank page at `/auth/callback`.** The route exists but never calls
`handleCallback()`, or it runs during SSR. See Step 3.

**Signed in, but the app says anonymous on reload.** You branched on
`isAuthenticated` before `ready`.

**Signing out returns you still signed in.** Fixed in `caselaw-auth` 0.1.3 —
the adapters used to clear the local session *before* awaiting the redirect,
and a route guard would see "anonymous", send the browser to sign in, and
cancel the sign-out in flight. Upgrade if you are below 0.1.3.

**401 from your API on tokens that look fine.** You are verifying `aud`. See
Step 4.

**`Failed to fetch` on the callback.** Web origins. Set it to `+`.

**Everything works locally, nothing works deployed.** Build-time variables
baked at build. Rebuild, or move to runtime config.

**Sessions end after five minutes.** Something copied the access token once
instead of reading it from the client per request.

---

## Further reading

- [REALM_SETUP.md](REALM_SETUP.md) — configuring a realm, or standing up your own
- [packages/caselaw-auth/README.md](../packages/caselaw-auth/README.md) — the full client API
- [AUTH_FRONTEND_PACKAGE.md](AUTH_FRONTEND_PACKAGE.md) — per-framework env plumbing
- [caselaw-access](https://github.com/MaastrichtU-BISS/caselaw-access) — plans, keys, quotas
- [caselaw-ui](https://github.com/MaastrichtU-BISS/caselaw-ui) — shared components, including the console shell
