# Realm configuration

Configuring a Keycloak realm for Case Law products: the shared `caselaw` realm,
a separate realm on the same server, or a realm on a Keycloak you run yourself.

**Audience.** Realm administrators and anyone standing up a new environment.

**Prerequisites.** Administrator access to the Keycloak console.

**Related.** [SERVER_SIDE_AUTH.md](SERVER_SIDE_AUTH.md) and
[CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md) for connecting a product to a
realm that already exists — neither requires anything on this page.

## Contents

1. [Deciding whether to create a realm](#1-deciding-whether-to-create-a-realm)
2. [Creating a realm](#2-creating-a-realm)
3. [Realm settings](#3-realm-settings)
4. [Passwordless sign-in](#4-passwordless-sign-in)
5. [Roles](#5-roles)
6. [Clients](#6-clients)
7. [Identity providers](#7-identity-providers)
8. [Connecting a product](#8-connecting-a-product)
9. [Exporting changes](#9-exporting-changes)
10. [Commissioning checklist](#10-commissioning-checklist)

---

## 1. Deciding whether to create a realm

A realm is an isolation boundary. Separate realms share no users, no sessions,
no roles: an account in one does not exist in the other, and a person with
business in both signs in twice.

**Join the `caselaw` realm** if your product serves the same people as the rest
of the estate. This is almost always the right answer — one account across
products is the entire point of the service, and every realm you add is another
user directory somebody has to administer.

**Take your own realm** when the users are genuinely a different population
(an external partner, a public pilot), when you need login rules that would be
wrong for everyone else (self-registration, a different identity provider,
a stricter password policy), or when you are running a Keycloak of your own for
an environment that must not touch production identities — a staging realm is
the common case.

Adding a realm to the hosted Keycloak is cheap. Splitting one population across
two realms afterwards is not.

---

## 2. Creating a realm

### From the shared realm file

`realm/caselaw-realm.json` is a working realm: themes, roles and five clients.
Copy it, change `realm` and `displayName`, drop the clients you do not want.

In the admin console: **Realms → Create realm → Browse**, upload the file.

Or, for a Keycloak you run yourself, mount it and start with `--import-realm`
as this repository's `docker-compose.yml` does.

> **`--import-realm` only ever creates.** It builds a realm from the file and
> then leaves it alone forever. On a server whose realm already exists, the
> realm's settings live in the database and editing the JSON changes nothing —
> no error, no warning, no effect. This surprises everyone once. To change a
> running realm, change it in the admin console (or over the admin API) and
> export it back.

### From scratch

**Realms → Create realm**, give it a name, then work down the next section. The
name becomes part of your issuer URL and cannot be changed later without
breaking every client:

```
https://<keycloak-host>/realms/<realm-name>
```

Use something short and lowercase. `caselaw` is the shared one; a staging realm
is conventionally `caselaw-staging`.

---

## 3. Realm settings

Everything here is under **Realm settings** in the admin console. The "shared
realm" column is what `caselaw-realm.json` sets, so you can see which choices
were deliberate.

### Login

| Setting | Shared realm | Why |
|---|---|---|
| User registration | **Off** | Keeps Keycloak's separate name/password form hidden. In optional passwordless mode, first-use OTP requests create email-only users instead |
| Forgot password | **On** | Otherwise every reset is a manual admin action |
| Remember me | **On** | Survives a browser restart |
| Email as username | **On** | People remember their email |
| Duplicate emails | **Off** | Required when email is the username, and you cannot change it later once accounts exist |
| Verify email | **On** | See the warning below |

> **Verify email and Forgot password both need SMTP, and the shared realm file
> does not configure it.** `verifyEmail: true` with no mail server is the single
> most common way to make a fresh realm unusable: Keycloak accepts the new
> account, refuses to let it log in until the address is confirmed, and cannot
> send the message that would confirm it. The user is locked out of an account
> that appears to exist, and nothing in the login page explains why. Password
> reset fails the same way, more quietly.
>
> Configure **Realm settings → Email** before you create a single user, or turn
> **Verify email** off until you have.

### Email

Required for the shared realm's email OTP-only sign-in, as well as
email verification and password resets. Set the host, port, from address, and
credentials if your relay wants them. Send the test message from that page — it
is the only cheap way to find out the relay rejects your from-address before a
real user does.

### Themes

| Setting | Case Law realm | DigiMach realm |
|---|---|---|
| Login theme | `caselaw` | `digimach` |
| Account theme | `caselaw` | `digimach` |

A theme only appears in the dropdown if the Keycloak image carries it, which
is what `themes/caselaw/` and `themes/digimach/` in this repository are for. On
the hosted instance the themes are already there. Realm theme settings apply to
every client inside that realm without affecting clients in another realm.

Because of the import-only rule above, selecting a theme in the JSON does
nothing to a realm that already exists. Set it in **Realm settings → Themes**,
or run:

```bash
KEYCLOAK_URL=https://auth.example.tech \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=... \
./scripts/apply-themes.sh
```

One-off either way: once the realm points at its chosen theme, later edits to
the theme's files ship with the next deployment.

For the Digimach realm, pass both selectors explicitly:

```bash
KEYCLOAK_URL=https://auth.example.tech \
KEYCLOAK_REALM=digimach \
KEYCLOAK_THEME=digimach \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=... \
./scripts/apply-themes.sh
```

To change only one project inside a shared realm, set the project's client-level
Login theme instead. That override does not include the account console, whose
theme is realm-wide. [THEMES.md](THEMES.md) explains both scopes, new realm
imports, verification, and troubleshooting.

### Sessions and tokens

The shared realm sets none of these, so Keycloak's defaults apply — as of 26.x,
a **5 minute** access token, **30 minute** SSO idle timeout and **10 hour** SSO
maximum. Check your version rather than trusting these numbers.

The short access token is not a problem to solve. `caselaw-auth` refreshes in
the background, and the lifetime is short deliberately: it bounds how long a
leaked token is worth anything. Lengthening it because "sessions keep expiring"
is treating a symptom — the real cause is almost always application code that
copied the token once instead of reading it per request.

Raise **SSO Session Idle** instead if people complain about being signed out
while working. That controls how long they may be away, and costs far less.

### Security

The realm file now sets these. **On a realm that already exists they do
nothing** — `--import-realm` only ever creates — so on the running deployment
they have to be applied by hand, under Realm settings → Sessions, → Tokens and
→ Security defenses.

| Setting | Value in the file | Why |
|---|---|---|
| Require SSL | `external` | HTTPS except localhost |
| Brute force detection | **On** | Without it, password guessing is unlimited |
| Password policy | length 12, not the username, last 3 remembered | Keycloak enforces nothing by default |
| SSO session idle | 30 min | Bounds how long a stolen refresh token keeps working |
| SSO session max | 10 h | Absolute cap regardless of activity |
| Revoke refresh token | **On** | Rotation — see below |
| Refresh token max reuse | 1 | Tolerates one race, still detects theft |

**Rotation is the one that matters for a browser app.** Products that use
`caselaw-auth/client` keep their session — refresh token included — in
`localStorage`, where any script on the page can read it. Rotation does not stop
that, but it changes what a stolen token is worth: with *Revoke refresh token*
on, each refresh returns a new token and invalidates the previous one, so a
thief and the real browser cannot both keep using it. The second one to refresh
is refused and the session dies, which turns silent, indefinite reuse into an
event.

The browser client handles this correctly — `refresh()` stores
`tokenResponse.refresh_token` when the provider sends one and falls back to the
existing token when it does not — so turning rotation on does not break it.

*Max reuse* is 1 rather than 0 on purpose. At 0 a refresh token is strictly
single-use, and two tabs refreshing at the same moment will race, one of them
losing its session for no reason the user can see. 1 absorbs that without
giving up detection.

Sessions have a second effect worth knowing: shortening **SSO session idle** is
what actually limits a leaked token's life, because a refresh token is only good
while its session is. Lengthening it because "people keep getting signed out" is
the wrong lever — it extends exactly the window this is trying to shrink.

Brute force detection is under **Realm settings → Security defenses**. Its
default lockout is temporary and escalating, which is the behaviour you want:
permanent lockout turns a nuisance into a support ticket and a denial-of-service
against a known username.

---

## 4. Passwordless sign-in

The image includes the pinned Phase Two `keycloak-magic-link` provider. New realms
default to Keycloak's built-in `browser` flow (username/email plus password). The
optional flow is present but unbound; when an operator enables it, its structure is:

```text
existing SSO cookie ─┐
identity provider ───┼─ alternative ways to finish sign-in
email address ───────┘
  └─ required email-methods subflow
     ├─ six-digit email OTP (required)
     └─ magic link (disabled; retained for migration)
```

Existing enabled users can sign in, and a previously unknown email can establish a
new email-only account. Requesting the first OTP creates an enabled but
unverified user whose username and email are that address. Completing the challenge
marks the email verified and authenticates the user. The separate Keycloak
registration form stays disabled, so no first name, last name, or password is
requested.

Keycloak's built-in User Profile normally requires `firstName` and `lastName` for
the `user` role. Disabling the registration page alone is therefore insufficient:
the default **Verify Profile** action can ask for both names after OTP. The installer
makes these two attributes optional while preserving them as usable profile fields.
It refuses to replace a custom role- or scope-based name requirement; review such a
realm policy explicitly before enabling email-only accounts.

OTP login actions expire after 10 minutes. Magic-link sign-in is disabled.
OTP attempts feed Keycloak's brute-force protection, and
a successful email OTP marks the user's address verified. The browser and
server libraries need no changes: both still start the same standard OIDC
authorization-code flow with PKCE.

The realm JSON includes this during a fresh import but leaves `browser` bound. For
an existing deployment, the production image can start Keycloak and apply the same
configuration through the loopback Admin API. It is opt-in with
`CASELAW_PASSWORDLESS_AUTO_APPLY=true`; the default is `false`. The operation is
idempotent, refuses drift, and logs a warning without stopping Keycloak if
reconciliation fails.

For manual recovery, or when automatic apply is disabled, deploy the image first so
the provider is present. An administrator can then run the published package from
any Node 18+ machine that can reach Keycloak—no repository checkout or Keycloak-host
shell is needed:

```bash
KEYCLOAK_URL=https://auth.caselawexplorer.tech \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD='...' \
npx --yes caselaw-auth@0.6.4 apply-passwordless-flow
```

Repository operators can instead run the equivalent
`node scripts/apply-passwordless-flow.mjs` command from a checkout.

**Running an installer is required to enable OTP on an existing or independently
created realm.** SMTP and the provider image are prerequisites, but neither changes
the browser-flow binding. Running the command is the explicit opt-in because it
creates/validates and binds the passwordless flow. The Admin Console cannot execute
the script itself; it is only used to configure the prerequisites and verify the
result.
Both the image configurator and the operator script refuse to overwrite drift.
Do not bind the flow before deploying the provider JAR: its `ext-email-otp` and
`ext-magic-form` executions will be unknown. The estate-wide rollout and
rollback procedure is in
[PASSWORDLESS_ROLLOUT.md](PASSWORDLESS_ROLLOUT.md); the concise setup procedure is
in [OTP_SETUP.md](OTP_SETUP.md).

For a project-specific realm that does not contain the Case Law estate clients, add
`CASELAW_PASSWORDLESS_ESTATE_MODE=false` to the command. That applies only the
generic realm flow and avoids creating or validating `caselaw-frontend`,
`citations-api`, and the other estate clients. The full different-realm sequence,
including the project's issuer and callback settings, is in
[OTP_SETUP.md](OTP_SETUP.md#path-b-project-using-a-different-realm).

Operational checks:

1. Send a test message under **Realm settings → Email** in the target realm.
2. Choose a reachable address that is not already a user in this realm.
3. Request a six-digit code and complete the application callback.
4. Confirm Keycloak created exactly one enabled, email-verified user with no names or
   password credential.
5. Sign out fully, sign in again, and confirm no duplicate user is created.
6. Confirm no method chooser is offered and the magic-link execution is disabled.
7. If rollback is required, restore the built-in `browser` binding; remember that
   email-only users cannot use it until an administrator gives them a password.

---

## 5. Roles

The shared realm defines three realm roles:

| Role | Meaning |
|---|---|
| `admin` | The one role the platform reads. Gates the access console, the database workbench, and administrator routes in the access service |
| `researcher` | Conventional; no shared code reads it |
| `service_consumer` | Conventional; no shared code reads it |

If your products use anything from this estate, define `admin` with that
spelling. It is the only cross-product contract.

**Realm role or client role.** A realm role is a claim about the person across
everything in the realm and lands in `realm_access.roles`. A client role says
something about them in one application and lands in
`resource_access.<client-id>.roles`. Default to client roles for anything
product-specific; a realm role that only one product understands is a realm
role that will confuse the next person reading a token.

Create them under **Realm roles**, assign under **Users → Role mapping**.

---

## 6. Clients

One per application. The shared realm ships five, and they are worth reading as
a set because they cover every shape you are likely to need:

| Client | Kind | Configuration |
|---|---|---|
| `caselaw-frontend` | public, browser | Standard flow on, PKCE `S256`, direct access grants off |
| `caselaw-access` | public, browser | Same |
| `caselaw-db-workbench` | public, browser | Same |
| `citations-api` | public, browser | Citations API docs/account UI; standard flow on, PKCE `S256`, direct access grants off |
| `caselaw-api` | **confidential, machine** | Standard flow **off**, service accounts **on**, no redirect URIs — it never signs a person in, it obtains tokens as itself |

The similarly named API clients are not interchangeable. `citations-api` is a
public browser client; `caselaw-api` holds a secret and acts as a machine. That
last one is the pattern for a backend that needs to call another service
under its own identity rather than on behalf of a user. It has a secret, which
lives in the server's environment and never reaches a browser.

Creating clients, with every field and the four people get wrong, is in
[CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md#3-keycloak-client-configuration).

---

## 7. Identity providers

Not configured in the shared realm today. When SURFconext is added, it is added
**to the realm**, and every product keeps pointing at the same issuer. Nothing
in any application changes, and no product should ever integrate with SURFconext
directly.

That is the main argument for one realm over several: a federation added once
reaches every product at the same moment.

**Identity providers → Add provider**, then map the incoming claims to the
Keycloak user under that provider's **Mappers** tab.

---

## 8. Connecting a product

Only the issuer changes:

```env
PUBLIC_AUTH_ISSUER=https://<keycloak-host>/realms/<realm-name>
```

Everything else in [CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md) applies
unchanged — the client setup, the environment variables, the frontend code, the
backend verification. `caselaw-auth` is provider-neutral and discovers every
endpoint from the issuer, so it has no idea which realm it is talking to.

A backend verifying tokens takes the matching issuer and derives its JWKS URL
from it. Tokens from one realm will not verify against another, which is the
isolation working.

---

## 9. Exporting changes

Anything you change in the admin console lives in the database, not in this
repository. A rebuilt deployment loses it unless you export.

There is no script for this yet — the README used to point at
`scripts/export-realm.sh`, which was never written. Two ways that work:

**Admin console:** Realm settings → Action (top right) → Partial export. Tick
groups, roles and clients. This runs against the live realm and downloads the
JSON.

**Admin API**, if you have a token:

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "$KEYCLOAK_URL/admin/realms/caselaw/partial-export?exportClients=true&exportGroupsAndRoles=true" \
  -o realm/caselaw-realm.json
```

Read the diff before committing. An export captures everything changed since
the last one, not just what you meant to change, and it is easy to commit
somebody else's half-finished experiment. Secrets are stripped, so the file is
safe to check in.

---

## 10. Commissioning checklist

- [ ] Issuer resolves: `curl https://<host>/realms/<realm>/.well-known/openid-configuration`
- [ ] SMTP configured if using passwordless, verify-email or password-reset email
- [ ] Test email actually arrives if an email feature is enabled
- [ ] Email OTP completes and magic-link sign-in is disabled if passwordless is enabled
- [ ] A brand-new email reaches the callback without a name or password form
- [ ] First and last name are optional under Realm settings → User profile
- [ ] The Citations API UI uses `citations-api`, not the machine client `caselaw-api`
- [ ] No magic-link option appears in a fresh login
- [ ] Brute force detection on, if reachable from the internet
- [ ] A password policy exists
- [ ] `admin` role exists, if you use anything from this estate
- [ ] One admin user has it, and can reach whatever it gates
- [ ] Themes selected in the realm, not merely named in the JSON
- [ ] One client created and a real sign-in completed end to end
- [ ] Realm exported and committed
