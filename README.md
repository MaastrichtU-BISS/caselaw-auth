# Case Law Explorer Auth

Self-contained Keycloak service for Case Law Explorer.

This repo packages:

- Keycloak 26.7.0
- Postgres for Keycloak metadata
- Phase Two's `keycloak-magic-link` provider, pinned to `0.75`
- a baseline `caselaw` realm import
- OIDC clients for the frontend, DB workbench, and API

The service is intended for Coolify as a separate resource, usually at:

```text
https://auth.caselawexplorer.tech
```

## Why Keycloak

Keycloak is the stable core for this because it supports OIDC, OAuth2, SAML,
identity brokering, roles, groups, sessions, and a mature admin UI. That is the
right foundation for SURFconext, which can be connected as an external OIDC or
SAML identity provider.

Email-code / magic-link login is not native Keycloak functionality. This repo
installs the Phase Two magic-link provider so we can configure that flow without
writing a custom Keycloak SPI immediately.

## Coolify Setup

Create a new Coolify service from this repo as a **Docker Compose** deployment.
Do not use Nixpacks for this repo: Nixpacks cannot detect it because the app is
not a Node/Python/static app, and it would not deploy the bundled Keycloak
Postgres metadata database.

Coolify settings:

```text
Build Pack: Docker Compose
Base Directory: /
Docker Compose file: docker-compose.yml
Public service: keycloak
Port Exposes: 8080
Domain: https://auth.caselawexplorer.tech
```

If you already created the resource as a Nixpacks application, either change
the build pack to Docker Compose if Coolify allows it, or delete/recreate the
resource as a Docker Compose application from the same GitHub repository.

Set:

```env
KEYCLOAK_VERSION=26.7.0
MAGIC_LINK_VERSION=0.75
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<long random password>
KEYCLOAK_HOSTNAME=https://auth.caselawexplorer.tech
KEYCLOAK_HOSTNAME_STRICT=false
KEYCLOAK_POSTGRES_DB=keycloak
KEYCLOAK_POSTGRES_USER=keycloak
KEYCLOAK_POSTGRES_PASSWORD=<long random password>
KC_LOG_LEVEL=info
```

Deploy once, then open:

```text
https://auth.caselawexplorer.tech/admin
```

The baseline realm is imported as `caselaw` on first startup.

### Nixpacks Detection Failure

If deployment fails with:

```text
Nixpacks failed to detect the application type
```

the Coolify resource is using the wrong build pack. Switch the resource to
Docker Compose, or recreate it as a Docker Compose deployment. Also change
`Port Exposes` from Coolify's default `3000` to:

```text
8080
```

Using the Dockerfile build pack alone is not enough for the default production
setup in this repo, because the Compose file also creates `keycloak-db`.

## Email Setup

Before email-code or magic-link login can work, configure SMTP:

1. Open Keycloak Admin Console.
2. Select realm `caselaw`.
3. Go to **Realm settings** → **Email**.
4. Set SMTP host, port, credentials, TLS settings, and sender address.
5. Send a test email.

The realm import leaves SMTP values empty on purpose so secrets are not stored
in git.

## Email-Code / Magic-Link Login

The provider jar is installed in `/opt/keycloak/providers/`, but the browser
authentication flow still needs to be configured in Keycloak.

Recommended first pass:

1. Open realm `caselaw`.
2. Go to **Authentication** → **Flows**.
3. Duplicate the built-in browser flow.
4. Add the Phase Two email OTP or magic-link authenticator from the installed
   provider.
5. Bind the new flow as the realm's browser flow.
6. Test with one admin user before exposing this to users.

Keep username/password or passkey login available as a fallback until the email
flow has been tested under load and with real SMTP deliverability.

## SURFconext

SURFconext should be added as an external identity provider in the `caselaw`
realm.

Typical setup:

1. Register `https://auth.caselawexplorer.tech` with SURFconext.
2. Choose OIDC if available for the application; otherwise use SAML.
3. In Keycloak, add an Identity Provider with alias `surfconext`.
4. Use the callback/ACS endpoint shown by Keycloak:

```text
https://auth.caselawexplorer.tech/realms/caselaw/broker/surfconext/endpoint
```

5. Map SURFconext attributes to Keycloak email, name, and groups/roles.

This part is intentionally not hardcoded in the realm import because SURFconext
metadata, client IDs, secrets, and attributes are tenant-specific.

## App Integration

OIDC issuer:

```text
https://auth.caselawexplorer.tech/realms/caselaw
```

Clients imported by default:

| Client | Type | Purpose |
|---|---|---|
| `caselaw-frontend` | public OIDC + PKCE | main frontend |
| `caselaw-db-workbench` | public OIDC + PKCE | SQL runner UI |
| `caselaw-api` | confidential service account | API/resource server |

We still need to update the frontend/API/workbench to trust this issuer once
the auth service is deployed and tested.

## Reusable Frontend Package

This repo also contains reusable auth packages:

```text
packages/auth-client
packages/auth-vue
```

`packages/auth-client` provides generic OIDC login, callback handling, token
refresh, logout, and role parsing for any frontend framework.

`packages/auth-vue` wraps the shared client with Vue composables and small
reusable account/login components.

Both packages are provider-neutral: products configure an issuer and client ID,
while Keycloak remains the current central provider.

Use it for new Vue/Nuxt products instead of re-implementing auth per app. See:

```text
docs/AUTH_FRONTEND_PACKAGE.md
packages/auth-client/README.md
packages/auth-vue/README.md
```

## Shared Account Model

All Case Law Explorer products should use the same Keycloak realm:

```text
caselaw
```

That realm is the shared account boundary. A user signs up or logs in once and
then uses the same identity across products. Each product gets its own Keycloak
client, but users, sessions, roles, and identity providers live centrally in
the `caselaw` realm.

Recommended model:

| Layer | What lives there |
|---|---|
| Realm | shared users, login policy, email setup, SURFconext, roles, groups |
| Client | one application/product integration |
| Realm roles | cross-product roles such as `admin`, `researcher`, `service_consumer` |
| Client roles | product-specific permissions, only when a role should not apply globally |
| Groups | organization/team membership, optionally mapped to roles |

Use realm roles for permissions that mean the same thing everywhere. For
example, `admin` should grant administrative access in every internal tool.
Use client roles for product-specific permissions such as
`citations-api:manage_keys` or `db-workbench:query`.

## Adding Another Product

For every new product, create a dedicated OIDC client in the `caselaw` realm.
Do not reuse an existing client between unrelated apps.

Browser applications:

1. Go to **Clients** → **Create client**.
2. Client type: `OpenID Connect`.
3. Client authentication: `Off` for public browser apps.
4. Standard flow: `On`.
5. Direct access grants: `Off`.
6. Enable PKCE with method `S256`.
7. Add redirect URIs for every deployed and local callback URL.
8. Add web origins for every deployed origin, or `+` to mirror redirect origins.

Server-side apps and APIs:

1. Create a confidential OIDC client.
2. Client authentication: `On`.
3. Standard flow: only enable if the server app performs user login.
4. Service accounts: enable only for machine-to-machine access.
5. Store the client secret only in the server/Coolify environment.

For product configuration, most OIDC libraries need:

```env
AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
AUTH_CLIENT_ID=<keycloak-client-id>
AUTH_CLIENT_SECRET=<only-for-confidential-clients>
AUTH_REDIRECT_URI=https://<product-domain>/auth/callback
```

Public browser apps should not have `AUTH_CLIENT_SECRET`; they should use
Authorization Code + PKCE.

## Integrating Existing Services

### Main frontend

Create or use client:

```text
caselaw-frontend
```

The frontend should redirect users to the shared issuer and keep its own app
session after the OIDC callback. Required values:

```env
AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
AUTH_CLIENT_ID=caselaw-frontend
```

### SQL runner UI / DB workbench

Create or use client:

```text
caselaw-db-workbench
```

The DB workbench should require the shared `admin` realm role before allowing
access to SQL tools.

```env
AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
AUTH_CLIENT_ID=caselaw-db-workbench
AUTH_REQUIRED_ROLE=admin
```

### API

The API should validate bearer JWTs from:

```text
https://auth.caselawexplorer.tech/realms/caselaw
```

Validation checklist:

1. Fetch JWKS from the issuer metadata.
2. Verify signature, expiry, issuer, and audience.
3. Read realm roles from `realm_access.roles`.
4. Read product-specific roles from `resource_access.<client-id>.roles`.
5. Keep API keys for machine/external consumers where long-lived scoped keys
   are still useful.

### Other products

For every future product:

1. Add a new Keycloak client.
2. Add product redirect URIs and web origins.
3. Decide whether it uses realm roles or client roles.
4. Configure the product with the shared issuer.
5. Test login, logout, refresh, and role enforcement.

## Logout and Single Sign-On

Because all products use the same realm, browser users get single sign-on
through the Keycloak session. Logging into one product can allow another product
to authenticate without another password/code challenge.

Each product should still keep its own local session cookie. On logout, decide
between:

- local logout: end only the current product session;
- global logout: redirect to Keycloak end-session endpoint and end the shared
  SSO session too.

Global logout endpoint:

```text
https://auth.caselawexplorer.tech/realms/caselaw/protocol/openid-connect/logout
```

## Anonymous Access

Keycloak should not be the first place we implement casual anonymous browsing.
For products that support anonymous exploration, keep anonymous state in the
product itself, then offer account linking when the user chooses to sign in.

Use Keycloak once the user becomes identifiable: email-code, password/passkey,
or SURFconext.

## Local Smoke Test

```sh
cp .env.example .env
# fill KEYCLOAK_ADMIN_PASSWORD and KEYCLOAK_POSTGRES_PASSWORD
docker compose -f docker-compose.yml -f compose.local.yml up --build
./scripts/smoke.sh http://localhost:8080
```
