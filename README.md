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
scripts/                    apply-themes.sh, smoke.sh
docs/                       connecting a product, and configuring a realm
```

## Nothing depends on this

Products treat sign-in as optional. The Citations API runs without it, the research
workspace has a `none` provider, and the access console is the only surface that
requires an account at all. Deploy this when you want one login across products, not
because something breaks without it.

## Which half of this do you need

Most people arrive here wanting the first of these, and the rest of this README is
about the second.

**Adding sign-in to your project**, against the instance already running at
`auth.caselawexplorer.tech` — you do not need to deploy anything, read the realm
file, or know any OIDC. Go to **[docs/CONNECTING_PROJECTS.md](docs/CONNECTING_PROJECTS.md)**:
the Keycloak client to create and every field that matters, the environment
variables for frontend and backend, the code for Vue, Svelte and everything else,
how an API verifies a token, and Case Law Explorer worked through end to end.
About an hour.

**Signing in from a server** rather than a browser — a server-rendered app, or
anything holding a shared secret such as DiscourseConnect — is
**[docs/SERVER_SIDE_AUTH.md](docs/SERVER_SIDE_AUTH.md)** and the
`caselaw-auth/server` entry point. The browser client cannot do these: it throws
off-browser, and a browser cannot keep a secret at all.

**Configuring a realm** — your own rather than the shared one, or the shared one
properly — is **[docs/REALM_SETUP.md](docs/REALM_SETUP.md)**: when a separate realm
is the right call, every realm setting that matters and what this one chooses, roles,
the four client shapes, and where an identity provider like SURFconext plugs in.

**Running your own copy** of the realm, theme and Keycloak — the rest of this
page.

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
KC_DB_PASSWORD=<a long random string>
KC_HOSTNAME=https://auth.example.org
```

```bash
docker compose up -d
```

The realm imports on first start. Keycloak is then reachable at `KC_HOSTNAME`, with
the admin console at `/admin` and the realm at `/realms/caselaw`.

Two things to do before letting anyone in. The realm turns on **Verify email** and
**Forgot password** but ships no mail server, so accounts cannot be confirmed and
resets cannot be sent until you configure SMTP. And brute force detection and a
password policy are both left at Keycloak's defaults, which is off and none.
[docs/REALM_SETUP.md](docs/REALM_SETUP.md) walks the whole realm configuration,
including a realm of your own rather than this one.

### Behind a reverse proxy

Keycloak builds absolute URLs from the hostname it believes it has. Set `KC_HOSTNAME`
to the public URL and make sure the proxy forwards `X-Forwarded-Proto`. Getting this
wrong produces redirects to `http://` on an HTTPS site, or to an internal hostname.

## Clients

One client per application that signs users in. Each needs its own redirect URIs and
its own web origins.

| Client | Application | Kind |
|---|---|---|
| `caselaw-frontend` | the research workspace | public, browser |
| `caselaw-access` | the access console | public, browser |
| `caselaw-db-workbench` | the database workbench | public, browser |
| `caselaw-api` | the API, acting as itself | confidential, service account |

The three browser clients use authorization code flow with PKCE and hold no secret.
`caselaw-api` is the other shape: standard flow off, service accounts on, no redirect
URIs — it never signs a person in, it obtains tokens as itself, and its secret stays
in the server's environment.

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
products. The realm file selects it, as `loginTheme` and `accountTheme`.

That selection only reaches a realm that does not exist yet. `--import-realm`
creates a realm from the file and then leaves it alone, so on a deployment that
is already running, the realm's settings live in its database and editing the
file changes nothing. Deploy so the image carries the theme, then apply it:

```bash
KEYCLOAK_URL=https://auth.example.tech KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=... ./scripts/apply-themes.sh
```

Or set it by hand under Realm settings, then Themes. Either way it is a
one-off: once the realm points at `caselaw`, later edits to the theme's files
ship with the next deployment.

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
