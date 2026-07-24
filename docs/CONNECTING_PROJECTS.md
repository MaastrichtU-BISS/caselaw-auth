# Connecting Projects To Case Law Auth

Use this checklist when adding a product to the shared auth service.

## 1. Create A Keycloak Client

In realm `caselaw`, create one client per product.

Use a public client for browser-only apps:

```text
Client authentication: Off
Standard flow: On
PKCE: S256
Direct access grants: Off
```

Use a confidential client for server-side apps:

```text
Client authentication: On
Standard flow: On only if it performs user login
Service accounts: On only for machine-to-machine calls
Direct access grants: Off
```

## 2. Configure URLs

Add every deployed and local callback URL:

```text
https://<product-domain>/auth/callback
http://localhost:<port>/auth/callback
```

Add web origins:

```text
https://<product-domain>
+
```

The `+` origin tells Keycloak to derive origins from valid redirect URIs.

## 3. Configure The Product

Common OIDC environment for server-side/confidential apps:

```env
AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
AUTH_CLIENT_ID=<client-id>
AUTH_REDIRECT_URI=https://<product-domain>/auth/callback
```

Only server-side/confidential clients should have:

```env
AUTH_CLIENT_SECRET=<secret>
```

Browser apps using `caselaw-auth` should use public runtime variables:

```env
PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
PUBLIC_AUTH_CLIENT_ID=<client-id>
PUBLIC_AUTH_REDIRECT_URI=https://<product-domain>/auth/callback
PUBLIC_AUTH_STORAGE_KEY=<product-specific-local-storage-key>
```

Use the same `PUBLIC_AUTH_ISSUER` across products, but a different client ID
and storage key per product.

## 4. Enforce Roles

Shared roles live in:

```text
realm_access.roles
```

Product-specific roles live in:

```text
resource_access.<client-id>.roles
```

Recommended shared roles:

```text
admin
researcher
service_consumer
```

## 5. Test

Before calling an integration done:

```text
Login works
Logout works
Refresh/session renewal works
Unauthorized users are rejected
Expected roles are present in the token
Local and deployed callback URLs both work
No `redirect_uri` error
No CORS/`Failed to fetch` error on callback
```

## 6. SURFconext

Once SURFconext is configured as an identity provider in the `caselaw` realm,
each product continues to use the same Keycloak issuer. Products should not
integrate with SURFconext directly.

The product talks to:

```text
https://auth.caselawexplorer.tech/realms/caselaw
```

Keycloak talks to SURFconext.
