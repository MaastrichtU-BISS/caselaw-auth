# caselaw-auth

[![npm](https://img.shields.io/npm/v/caselaw-auth?logo=npm&label=npm&color=%23181849)](https://www.npmjs.com/package/caselaw-auth)

One shared account across every Case Law Explorer product. A Keycloak realm, the theme
it wears, and the browser client the applications sign in with.

Users sign in once. The Citations API, the research workspace, the access console and
the database workbench all accept the same account, and roles decide what each one
shows.

## What is in here

```
realm/caselaw-realm.json    the realm: clients, roles, login settings
themes/caselaw/             the Case Law Explorer sign-in theme
providers/                  Keycloak provider JARs
packages/caselaw-auth/      the browser client, published on npm
docker-compose.yml          Keycloak and its Postgres
scripts/                    realm import and export helpers
docs/                       client setup notes
```

## Nothing depends on this

Products treat sign-in as optional. The Citations API runs without it, the research
workspace has a `none` provider, and the access console is the only surface that
requires an account at all. Deploy this when you want one login across products, not
because something breaks without it.

## Self-hosting

Requirements: Docker, a Postgres for Keycloak's own storage, and a domain with TLS.

```bash
git clone https://github.com/davidwickerhf/caselaw-auth.git
cd caselaw-auth
cp .env.example .env
```

Set the admin account and the database:

```bash
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<a long random string>
KC_DB_PASSWORD=<a long random string>
KC_HOSTNAME=https://auth.example.org
```

```bash
docker compose up -d
```

The realm imports on first start. Keycloak is then reachable at `KC_HOSTNAME`, with
the admin console at `/admin` and the realm at `/realms/caselaw`.

### Behind a reverse proxy

Keycloak builds absolute URLs from the hostname it believes it has. Set `KC_HOSTNAME`
to the public URL and make sure the proxy forwards `X-Forwarded-Proto`. Getting this
wrong produces redirects to `http://` on an HTTPS site, or to an internal hostname.

## Clients

One client per application that signs users in. Each needs its own redirect URIs and
its own web origins.

| Client | Application |
|---|---|
| `caselaw-frontend` | the research workspace |
| `caselaw-access` | the access console |
| `caselaw-db-workbench` | the database workbench |
| `citations-api` | the API's own pages, when it signs anyone in |

All are public clients using authorization code flow with PKCE. No client secrets in
browsers.

### Adding one

In the admin console, under Clients:

1. Client ID matching what the application sets as its `clientId`
2. Standard flow on, direct access grants off
3. Valid redirect URIs: the application's callback, exactly, including scheme and path
4. Web origins: the application's origin
5. PKCE method `S256`

A redirect URI that does not match exactly fails at the end of sign-in, after the
password has already been accepted, which reads as a broken application rather than a
configuration error.

## Roles

`admin` is the one role the platform reads. It gates the access console, the database
workbench, and administrator routes in the access service.

Assign it in the admin console under Users, then Role mapping. It can be a realm role
or a client role; the browser client reads both.

Everything else about what a user may do comes from
[caselaw-access](https://github.com/davidwickerhf/caselaw-access), which owns plans,
API keys and per-endpoint scopes. Keycloak answers who someone is. Access answers what
they may call.

## The theme

`themes/caselaw` styles the sign-in, registration and account pages to match the
products. The realm file selects it already, as `loginTheme` and `accountTheme`;
in a realm configured by hand it is set under Realm settings, then Themes.

The two halves work differently, and it matters when editing them. The login
theme overrides FreeMarker templates, which are ours to change. The account
console is a compiled application, so its markup is not: `account/` restyles it
by setting PatternFly's own custom properties, which survive a Keycloak upgrade
where class names would not.

Editing it during development:

```bash
docker compose -f compose.local.yml up
```

That mounts the theme directory and turns off theme caching, so a change shows on
reload.

## Exporting realm changes

Changes made in the admin console live in the database, not in this repository. Export
them back so a fresh deployment gets them:

```bash
./scripts/export-realm.sh
```

It writes `realm/caselaw-realm.json`. Commit the result. Secrets are stripped, so the
file is safe to check in, but read the diff before committing: an export also captures
anything else changed in the console since the last one.

## The browser client

Applications sign in through the npm package in `packages/caselaw-auth`:

```bash
npm install caselaw-auth
```

```ts
import { createAuthClient } from "caselaw-auth";

const auth = createAuthClient({
  issuer: "https://auth.example.org/realms/caselaw",
  clientId: "my-product",
  redirectUri: `${location.origin}/auth/callback`,
});
```

Vue and Svelte adapters ship alongside it. See
[packages/caselaw-auth/README.md](packages/caselaw-auth/README.md).

## Troubleshooting

**Sign-in ends on a blank page or an `invalid_redirect_uri` error.** The redirect URI
does not exactly match one on the client. Trailing slashes count.

**Signing out shows "Invalid redirect uri".** Keycloak validates where sign-out
returns to, separately from where sign-in returns to. Set the client's **Valid post
logout redirect URIs** to `+`, which reuses the sign-in list, or add the origin
explicitly. This one is easy to miss because it appears after the session has already
ended, so the user is signed out and looking at an error.

**Redirects go to `http://` on an HTTPS site.** The proxy is not forwarding
`X-Forwarded-Proto`, or `KC_HOSTNAME` is unset.

**A session ends after five minutes.** That is the default access token lifetime. The
browser client refreshes automatically. An application that copied a token out and
stored it will not.

**The theme does not change.** Theme caching is on outside `compose.local.yml`.
Restart Keycloak after changing theme files.

## Related repositories

- [caselaw-access](https://github.com/davidwickerhf/caselaw-access), plans, API keys and rate limits
- [caselaw-ui](https://github.com/davidwickerhf/caselaw-ui), shared interface components
- [caselaw-coolify](https://github.com/davidwickerhf/caselaw-coolify), the deployment bundle
