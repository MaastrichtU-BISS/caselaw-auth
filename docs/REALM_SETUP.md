# Setting up a realm

For anyone who needs a realm of their own rather than the shared `caselaw` one:
a separate realm on the hosted Keycloak, or a realm on a Keycloak you run
yourself. It covers every setting that matters, what the shared realm chooses,
and why.

If you only want to add sign-in to a product against a realm that already
exists, you do not need any of this — see
[CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md).

---

## Do you actually need one

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

## Two ways to create one

### Import the shared realm as a starting point

`realm/caselaw-realm.json` is a working realm: themes, roles and four clients.
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

### Build one by hand

**Realms → Create realm**, give it a name, then work down the next section. The
name becomes part of your issuer URL and cannot be changed later without
breaking every client:

```
https://<keycloak-host>/realms/<realm-name>
```

Use something short and lowercase. `caselaw` is the shared one; a staging realm
is conventionally `caselaw-staging`.

---

## The settings that matter

Everything here is under **Realm settings** in the admin console. The "shared
realm" column is what `caselaw-realm.json` sets, so you can see which choices
were deliberate.

### Login

| Setting | Shared realm | Why |
|---|---|---|
| User registration | **Off** | Accounts are provisioned, not self-served. Turning this on means anyone on the internet can create one |
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

Required if you enabled either of the above. Host, port, from address, and
credentials if your relay wants them. Send the test message from that page —
it is the only cheap way to find out the relay rejects your from-address before
a real user does.

### Themes

| Setting | Shared realm |
|---|---|
| Login theme | `caselaw` |
| Account theme | `caselaw` |

A theme only appears in the dropdown if the Keycloak image carries it, which
is what `themes/caselaw/` in this repository is for. On the hosted instance the
theme is already there.

Because of the import-only rule above, selecting a theme in the JSON does
nothing to a realm that already exists. Set it in **Realm settings → Themes**,
or run:

```bash
KEYCLOAK_URL=https://auth.example.tech \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=... \
./scripts/apply-themes.sh
```

One-off either way: once the realm points at `caselaw`, later edits to the
theme's files ship with the next deployment.

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

## Roles

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

## Clients

One per application. The shared realm ships four, and they are worth reading as
a set because they cover every shape you are likely to need:

| Client | Kind | Configuration |
|---|---|---|
| `caselaw-frontend` | public, browser | Standard flow on, PKCE `S256`, direct access grants off |
| `caselaw-access` | public, browser | Same |
| `caselaw-db-workbench` | public, browser | Same |
| `caselaw-api` | **confidential, machine** | Standard flow **off**, service accounts **on**, no redirect URIs — it never signs a person in, it obtains tokens as itself |

That last one is the pattern for a backend that needs to call another service
under its own identity rather than on behalf of a user. It has a secret, which
lives in the server's environment and never reaches a browser.

Creating clients, with every field and the four people get wrong, is in
[CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md#step-1--create-the-keycloak-client).

---

## Identity providers

Not configured in the shared realm today. When SURFconext is added, it is added
**to the realm**, and every product keeps pointing at the same issuer. Nothing
in any application changes, and no product should ever integrate with SURFconext
directly.

That is the main argument for one realm over several: a federation added once
reaches every product at the same moment.

**Identity providers → Add provider**, then map the incoming claims to the
Keycloak user under that provider's **Mappers** tab.

---

## Pointing a product at your realm

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

## Exporting changes back

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

## Before you call it done

- [ ] Issuer resolves: `curl https://<host>/realms/<realm>/.well-known/openid-configuration`
- [ ] SMTP configured, **or** Verify email and Forgot password both off
- [ ] Test email actually sends
- [ ] Brute force detection on, if reachable from the internet
- [ ] A password policy exists
- [ ] `admin` role exists, if you use anything from this estate
- [ ] One admin user has it, and can reach whatever it gates
- [ ] Themes selected in the realm, not merely named in the JSON
- [ ] One client created and a real sign-in completed end to end
- [ ] Realm exported and committed
