# Reusable Frontend Auth Package

This repository includes a single reusable frontend auth package:

```text
packages/caselaw-auth
```

The package provides OIDC login/session/logout behavior for all Case Law
Explorer products. It is intentionally provider-neutral: products configure an
OIDC issuer and client ID, while Keycloak remains an implementation detail of
the central auth service.

The framework-adapter examples below are for **browser-held sessions**. If the product has a backend,
prefer [server-side authentication](SERVER_SIDE_AUTH.md); do not move a confidential
secret into frontend configuration. See [rollout status](AUTH_ROLLOUT_STATUS.md)
for deployment-specific limitations and pending Coolify mappings.

For that browser-held path, use `caselaw-auth`, `caselaw-auth/client`, or `caselaw-auth/svelte` from
SvelteKit, plain TypeScript, and non-Vue apps. Use `caselaw-auth/vue` from Vue
3 and Nuxt apps.

## Package Contract

For browser-held sessions, wire the following values into the package config.
These variable names are conventions, not automatically discovered settings:

```env
PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
PUBLIC_AUTH_CLIENT_ID=<project-client-id>
PUBLIC_AUTH_REDIRECT_URI=https://<project-domain>/auth/callback
PUBLIC_AUTH_STORAGE_KEY=<product-specific-local-storage-key>
```

Frontend build systems expose these differently:

```env
VITE_AUTH_ISSUER=...
VITE_AUTH_CLIENT_ID=...
VITE_AUTH_REDIRECT_URI=...
```

```env
NUXT_PUBLIC_AUTH_ISSUER=...
NUXT_PUBLIC_AUTH_CLIENT_ID=...
NUXT_PUBLIC_AUTH_REDIRECT_URI=...
```

## What The Packages Own

- OIDC discovery
- Authorization Code + PKCE login
- callback handling
- token storage
- refresh-token renewal
- logout redirect
- framework-neutral session helpers
- Vue plugin/injection
- `useAuth()` and `useAuthState()` composables
- reusable login/logout/account/gate components
- realm and client role parsing

## What Products Own

- creating their own Keycloak client
- choosing which pages require login
- mapping roles to product permissions
- server-side API authorization
- product-specific account pages
- visual overrides via CSS variables or wrapper components

## Recommended Project Pattern

Use one small local auth adapter per product:

```text
src/lib/auth.ts
```

That adapter reads the product's env variables and initializes
`caselaw-auth`. Product code then imports from the local adapter instead
of importing the package everywhere. This keeps future migration easy.

## Current Case Law Explorer integration

The Coolify stabilization frontend at `demo-app.caselawexplorer.tech` uses the
server entry point. The public `app.caselawexplorer.tech` remains the legacy Vercel
deployment; do not treat it as migrated. Application-facing values for the OIDC
frontend include:

```env
FRONTEND_AUTH_PROVIDER=oidc
REQUIRE_FRONTEND_AUTH=true
PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
PUBLIC_AUTH_CLIENT_ID=caselaw-frontend
PUBLIC_AUTH_REDIRECT_URI=https://demo-app.caselawexplorer.tech/auth/callback
PUBLIC_AUTH_STORAGE_KEY=caselaw:frontend:auth
AUTH_SESSION_SECRET=<unique random value>
```

The server starts OIDC with PKCE and keeps its session and tokens in httpOnly
cookies. `PUBLIC_AUTH_STORAGE_KEY` remains accepted for compatibility but does
not name the server cookie. The server-side API proxy retains the distinction
between deployment credentials and the signed-in user's access token. Keep the
product's API authorization policy; login alone does not grant plans or roles.

These are application-facing names, not an instruction to paste them unchanged
into Coolify. The bundle's `FRONTEND_PUBLIC_AUTH_*` inputs and pending runtime
mappings are documented in the
[version-gated Coolify guide](https://github.com/MaastrichtU-BISS/caselaw-coolify/blob/main/docs/PROJECT_AUTH_DOMAINS.md).

Email OTP UX belongs to the shared realm. The platform only
navigates to `/auth/login`; it must not copy the old Supabase code-entry form
into the OIDC path. See [PASSWORDLESS_ROLLOUT.md](PASSWORDLESS_ROLLOUT.md).

APIs must validate the intended issuer/audience and enforce their own permissions.
Moving legacy Supabase-backed account data to Keycloak identities is a separate,
reviewed migration, not an automatic side effect of enabling OIDC or OTP. For a
different project realm, also check the pending Access release gate before
assuming its token will be accepted by Access-protected endpoints.
