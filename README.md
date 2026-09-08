# caselaw-auth

[![npm](https://img.shields.io/npm/v/caselaw-auth?logo=npm&label=npm&color=%23181849)](https://www.npmjs.com/package/caselaw-auth)

One shared account across every Case Law Explorer product. A Keycloak realm, the theme
it wears, and the client library applications sign in with — in the browser or on
their own server.

Username/email and password is the safe default. Operators can opt a realm into
six-digit email OTP after commissioning SMTP. The
Citations API, research workspace, access console and database workbench all accept
the same account, and roles decide what each one shows. In an opted-in realm, a new
person enters only an email address: submitting a new address creates a pending
email-only user, and completing the challenge verifies and signs in that user. No
name or password form is used.

## What is in here

```
realm/caselaw-realm.json    the realm: clients, roles, login settings
themes/caselaw/             the Case Law Explorer login and account theme
themes/digimach/            the DigiMach sibling theme, inheriting Case Law coverage
providers/                  Keycloak OTP and magic-link provider
packages/caselaw-auth/      the client library, published on npm
docker-compose.yml          Keycloak and its Postgres
scripts/                    live-realm installers and smoke checks
docs/                       integration guides and realm reference
```

## Nothing depends on this

Products keep an explicit unauthenticated or API-key-only mode where that makes
sense. The Citations API can run without browser login and the research workspace has
a `none` provider for local development and CI; the hosted access console and database
workbench require accounts. Deploy this when you want one login across products, not
to make local services boot.

## Documentation

Most people arrive here to connect a product, not to run this. The guides are
indexed in **[docs/](docs/README.md)**; the rest of this README is about operating the
service itself.

| Task | Guide |
|---|---|
| Enable optional email OTP | [docs/OTP_SETUP.md](docs/OTP_SETUP.md) |
| Give a project its own `auth.<domain>` | [docs/PROJECT_AUTH_DOMAINS.md](docs/PROJECT_AUTH_DOMAINS.md) |
| Monitor and maintain OTP | [docs/OTP_OPERATIONS.md](docs/OTP_OPERATIONS.md) |
| Roll out email OTP across Case Law | [docs/PASSWORDLESS_ROLLOUT.md](docs/PASSWORDLESS_ROLLOUT.md) |
| Connect a product that **has a backend** | [docs/SERVER_SIDE_AUTH.md](docs/SERVER_SIDE_AUTH.md) |
| Connect a **static SPA** | [docs/CONNECTING_PROJECTS.md](docs/CONNECTING_PROJECTS.md) |
| Configure a realm | [docs/REALM_SETUP.md](docs/REALM_SETUP.md) |
| Apply a theme to a project or realm | [docs/THEMES.md](docs/THEMES.md) |
| Run your own Keycloak | The rest of this page |

Neither integration guide requires deploying anything: both work against the instance
already running at `auth.caselawexplorer.tech`.

> **Where a backend exists, use the server path.** The browser client keeps the
> session — refresh token included — in `localStorage`, where page script can read it.
> The server path keeps it in an httpOnly cookie that script cannot reach. Some things
> only the server path can do at all: anything holding a shared secret, such as
> DiscourseConnect, is impossible in a browser.

## Self-hosting

Requirements: Docker, a Postgres for Keycloak's own storage, and a domain with TLS.

```bash
git clone https://github.com/MaastrichtU-BISS/caselaw-auth.git
cd caselaw-auth
cp .env.example .env
```

Set the admin account and the database:

```bash
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<a long random string>
KEYCLOAK_POSTGRES_PASSWORD=<a long random string>
KEYCLOAK_HOSTNAME=https://auth.example.org
```

```bash
docker compose up -d
```

The realm imports on first start. Keycloak is then reachable at `KEYCLOAK_HOSTNAME`, with
the admin console at `/admin` and the realm at `/realms/caselaw`.

Configure SMTP before enabling email OTP, **Verify email**, or
**Forgot password**. Basic password sign-in does not require SMTP, and the realm
deliberately ships without mail-server credentials. Brute force detection and a
password policy are already enabled.
[docs/REALM_SETUP.md](docs/REALM_SETUP.md) walks the whole realm configuration,
including a realm of your own rather than this one.

The imported realm and Compose deployment both keep Keycloak's built-in password
browser flow by default. To enable OTP, an administrator can run
`npx --yes caselaw-auth@0.6.4 apply-passwordless-flow` against the target realm from
any Node 18+ machine—no repository checkout or server shell is needed. Alternatively,
a deployment operator can explicitly set `CASELAW_PASSWORDLESS_AUTO_APPLY=true`.
Either path creates/validates and binds the email flow; SMTP or application
configuration alone does not. It also disables the separate registration page and
makes the realm's default first/last-name fields optional, allowing a new user to
complete sign-in using only email and the received code. See
[docs/OTP_SETUP.md](docs/OTP_SETUP.md) before enabling it.

### Behind a reverse proxy

Keycloak builds absolute URLs from the hostname it believes it has. Set the Compose
input `KEYCLOAK_HOSTNAME` (mapped to Keycloak's `KC_HOSTNAME`) to the public URL and
make sure the proxy overwrites `X-Forwarded-*` headers. Getting this
wrong produces redirects to `http://` on an HTTPS site, or to an internal hostname.

One deployment can serve multiple project domains. Add each HTTPS domain to the
existing proxy/service and configure its realm's **Frontend URL**. Keep
`KEYCLOAK_ADMIN_HOSTNAME` on the shared administration origin. Follow
[Project authentication domains](docs/PROJECT_AUTH_DOMAINS.md) for DNS, TLS,
realm configuration, application issuer migration and verification.

## Clients

One client per application that signs users in. Each needs its own redirect URIs and
its own web origins.

| Client | Application | Kind |
|---|---|---|
| `caselaw-frontend` | the research workspace | public, browser |
| `caselaw-access` | the access console | public, browser |
| `caselaw-db-workbench` | the database workbench | public, browser |
| `citations-api` | the Citations API docs/account UI | public, browser |
| `caselaw-api` | backend-to-backend calls | confidential, service account |

The four browser clients use authorization code flow with PKCE and hold no secret.
`caselaw-api` is the other shape: standard flow off, service accounts on, no redirect
URIs — it never signs a person in, it obtains tokens as itself, and its secret stays
in the server's environment. The browser-facing `citations-api` client must not reuse
it.

### Adding one

In the admin console, under Clients:

1. Client ID matching what the application sets as its `clientId`
2. Standard flow on, direct access grants off
3. Valid redirect URIs: the application's callback, exactly, including scheme and path
4. Web origins: the application's origin
5. PKCE method `S256`

A redirect URI that does not match exactly fails at the end of sign-in, after the
email challenge has already succeeded, which reads as a broken application rather
than a configuration error.

That is the short version.
[docs/CONNECTING_PROJECTS.md](docs/CONNECTING_PROJECTS.md) has every field with its
default, when to choose a confidential client instead, and why each of the four
settings people get wrong matters.

## Roles

`admin` is the one role the platform reads. It gates the access console, the database
workbench, and administrator routes in the access service.

Assign it in the admin console under Users, then Role mapping. It can be a realm role
or a client role; the browser client reads both.

Everything else about what a user may do comes from
[caselaw-access](https://github.com/MaastrichtU-BISS/caselaw-access), which owns plans,
API keys and per-endpoint scopes. Keycloak answers who someone is. Access answers what
they may call.

## The theme

`themes/caselaw` styles the sign-in, registration and account pages to match the
products. `themes/digimach` inherits that complete implementation and applies
DigiMach's brand palette and mark. See
[`themes/digimach/README.md`](themes/digimach/README.md) for the realm-wide
setup that gives every client in the Digimach realm the new look while leaving
the separate Case Law realm unchanged.
The realm file selects `caselaw` as its default `loginTheme` and `accountTheme`.
The complete instructions for realm-wide defaults and project/client-level
login overrides are in [docs/THEMES.md](docs/THEMES.md).

The email-code step is a local override of the provider's `otp-form.ftl`. It keeps
one real six-digit field and the provider's `submit` and `resend` form contract,
while presenting six visual digit slots. This preserves whole-code paste, mobile
one-time-code autofill, keyboard behavior, accessible hint/error relationships, and
a clear action hierarchy. User-facing OTP copy lives in `login/messages/messages_en.properties`
and `messages_nl.properties`; the shared visual system lives in
`login/resources/css/caselaw-login-v2.css`.

`theme.properties` loads that CSS through a versioned entry point. Bump the entry
point filename and its import revision when changing cached login styles, because
the public Keycloak resource URL can otherwise remain stable across a deployment
and an existing browser may retain the old screen.

That selection only reaches a realm that does not exist yet. `--import-realm`
creates a realm from the file and then leaves it alone, so on a deployment that
is already running, the realm's settings live in its database and editing the
file changes nothing. Passwordless flow and client configuration are reconciled
automatically on container startup; theme selection is separate. Deploy so the
image carries the theme, then apply that setting when needed:

```bash
KEYCLOAK_URL=https://auth.example.tech KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=... ./scripts/apply-themes.sh
```

Or set it by hand under Realm settings, then Themes. Either way it is a
one-off: once a realm points at its theme, later edits to the theme's files ship
with the next deployment.

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
them back so a fresh deployment gets them, from **Realm settings → Action → Partial
export**, ticking groups, roles and clients.

Write the result to `realm/caselaw-realm.json` and commit it. Secrets are stripped, so
the file is safe to check in, but read the diff before committing: an export also
captures anything else changed in the console since the last one.

The API equivalent, and the rest of the realm's configuration, is in
[docs/REALM_SETUP.md](docs/REALM_SETUP.md).

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

Vue and Svelte adapters ship alongside it, with `AuthGate`, `LoginButton`,
`LogoutButton`, `AccountMenu` and `CallbackView` for Vue.

- [docs/CONNECTING_PROJECTS.md](docs/CONNECTING_PROJECTS.md) — wiring it into a
  product, with the callback route, the backend check and the role rules
- [packages/caselaw-auth/README.md](packages/caselaw-auth/README.md) — the full
  client API

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

- [caselaw-access](https://github.com/MaastrichtU-BISS/caselaw-access), plans, API keys and rate limits
- [caselaw-ui](https://github.com/MaastrichtU-BISS/caselaw-ui), shared interface components
- [caselaw-coolify](https://github.com/MaastrichtU-BISS/caselaw-coolify), the deployment bundle
