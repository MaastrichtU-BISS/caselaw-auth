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

Create a new Coolify service from this repo and expose the `keycloak` service
on port `8080`.

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

## Local Smoke Test

```sh
cp .env.example .env
# fill KEYCLOAK_ADMIN_PASSWORD and KEYCLOAK_POSTGRES_PASSWORD
docker compose -f docker-compose.yml -f compose.local.yml up --build
./scripts/smoke.sh http://localhost:8080
```
