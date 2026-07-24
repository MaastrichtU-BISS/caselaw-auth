# Reusable Frontend Auth Package

This repository includes a framework-neutral client and a Vue/Nuxt wrapper:

```text
packages/auth-client
packages/auth-vue
```

The shared client provides OIDC login/session/logout behavior for all Case Law
Explorer products. It is intentionally provider-neutral: products configure an
OIDC issuer and client ID, while Keycloak remains an implementation detail of
the central auth service.

Use `@caselaw/auth-client` from SvelteKit, plain TypeScript, and non-Vue apps.
Use `@caselaw/auth-vue` from Vue 3 and Nuxt apps.

## Package Contract

Every project should depend on the same shape of environment variables:

```env
AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
AUTH_CLIENT_ID=<project-client-id>
AUTH_REDIRECT_URI=https://<project-domain>/auth/callback
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
`@caselaw/auth-vue`. Product code then imports from the local adapter instead
of importing the package everywhere. This keeps future migration easy.

## Caselaw Migration Path

For the main Caselaw frontend, use:

```env
FRONTEND_AUTH_PROVIDER=oidc
REQUIRE_FRONTEND_AUTH=true
AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
AUTH_CLIENT_ID=caselaw-frontend
AUTH_REDIRECT_URI=https://<frontend-domain>/auth/callback
```

The frontend can keep using its existing server-side `API_TOKEN` proxy while
the API is migrated. That gives us shared login first without breaking API-key
scoping, rate limits, or admin flows.

After that, update the API to trust JWTs from:

```text
https://auth.caselawexplorer.tech/realms/caselaw
```

Then account, key-management, and admin pages can be moved from Supabase IDs to
Keycloak subjects or a dedicated identity-mapping table.
