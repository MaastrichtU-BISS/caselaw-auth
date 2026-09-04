# Passwordless sign-in across Case Law Explorer

Email OTP and magic-link sign-in are available as an optional shared Keycloak
browser flow. Username/email and password is the repository default. When an
operator opts a realm into passwordless mode, every interactive Case Law product
redirects to that flow, so products do not implement email delivery, generate
codes, or validate links. They continue to speak ordinary OpenID Connect (OIDC)
authorization code flow with PKCE and receive the same tokens and user subjects.

For the shortest colleague-facing setup procedure, start with
[OTP_SETUP.md](OTP_SETUP.md). This guide is the production contract for the whole
Case Law estate. It covers
the realm, the Explorer platform, the access console, the database workbench,
the Citations API UI, non-interactive services, rollout, verification and
rollback.

## Contents

1. [Architecture and boundaries](#1-architecture-and-boundaries)
2. [Authentication flow](#2-authentication-flow)
3. [Service integration matrix](#3-service-integration-matrix)
4. [Case Law Explorer platform](#4-case-law-explorer-platform)
5. [Other interactive services](#5-other-interactive-services)
6. [APIs and machine clients](#6-apis-and-machine-clients)
7. [Production rollout](#7-production-rollout)
8. [End-to-end verification](#8-end-to-end-verification)
9. [Rollback](#9-rollback)
10. [Security and operations](#10-security-and-operations)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture and boundaries

```text
Case Law Explorer ───────┐
Access console ──────────┤
DB workbench ────────────┼─ OIDC + PKCE ─→ shared caselaw realm
Citations API UI ────────┘                    │
                                             ├─ email OTP
                                             └─ single-use magic link

access token ─→ Citations API / access checks (unchanged)
service token ─→ backend-to-backend calls    (unchanged)
```

Keycloak owns proof of identity and its realm-wide SSO session. Applications
own their callback and local session. `caselaw-access` owns plans, API keys,
quotas and product permissions. Changing how Keycloak proves identity does not
change a user's stable `sub`, roles, API keys, saved data or access plan.

The feature is realm-wide. Do not reproduce OTP endpoints in each product and
do not send credentials through a Case Law API. Centralizing the flow gives all
products the same expiry, brute-force handling, email templates and audit
events, and a user who has signed in once keeps SSO across the estate.

The client libraries require no OTP-specific API. `caselaw-auth/server`,
`caselaw-auth-server` and `caselaw-auth/client` all start the same OIDC flow;
Keycloak decides which screen and email challenge appears.

---

## 2. Authentication flow

When passwordless mode is enabled, the realm binds
`caselaw-browser-passwordless` as its browser flow:

```text
caselaw-browser-passwordless                          ALTERNATIVE set
├─ Cookie                                             ALTERNATIVE
├─ Identity Provider Redirector                       ALTERNATIVE
└─ Case Law passwordless forms                        ALTERNATIVE
   ├─ Username Form                                   REQUIRED
   └─ Case Law email methods                          REQUIRED subflow
      ├─ Email OTP                                    ALTERNATIVE
      └─ Magic Link                                   ALTERNATIVE
```

The separate `Case Law email methods` subflow is important. Keycloak considers
a required execution sufficient to complete its own flow, so putting OTP and
magic link directly beside the required username form would make the
alternatives functionally disabled.

Runtime policy:

- only existing, enabled Keycloak users may sign in;
- neither method creates an account;
- the OTP is six digits and expires with the 10-minute login action;
- a magic link expires after 10 minutes and can be redeemed once;
- a successful email OTP marks that address verified;
- invalid OTP attempts are recorded as login errors and feed realm brute-force
  protection;
- an existing Keycloak SSO cookie completes sign-in before another email is
  sent;
- identity providers added later remain available through the redirector.

Unknown addresses receive the same browser continuation as known addresses,
but no message is sent and no user is created. Product pages must not add their
own “account exists” checks around this flow.

Within the optional passwordless flow, email OTP is the default method. After
entering an email, the code form exposes
**Try Another Way**, which opens a chooser containing **Email OTP** and
**Magic link**. The OTP authenticator sends its message when the code form is
first rendered, so someone who then switches to magic link receives both
messages and should ignore the code. Avoiding that extra message would require
a custom pre-send chooser authenticator rather than the pinned upstream
provider; it is not application behavior and must not be worked around in each
product.

---

## 3. Service integration matrix

| Surface | Client | Shape | Production callback | Passwordless impact |
|---|---|---|---|---|
| Case Law Explorer platform | `caselaw-frontend` | public client, server-held session, PKCE | `https://app.caselawexplorer.tech/auth/callback` (demo uses `demo-app`) | Inherits the realm flow; no product OTP code |
| Access console | `caselaw-access` | public client, Python server-held session, PKCE | `https://access.caselawexplorer.tech/auth/callback` | Inherits the realm flow; admin role checks stay local |
| Database workbench | `caselaw-db-workbench` | public client, server-held session, PKCE | `https://demo-db.caselawexplorer.tech/auth/callback` | Inherits the realm flow; still requires `admin` |
| Citations API docs/account UI | `citations-api` | public browser client, PKCE | `https://demo-api.caselawexplorer.tech/auth/callback` or `api` | New dedicated client; must not use `caselaw-api` |
| Citations API HTTP endpoints | none for browser login | bearer JWT or API key, checked through access | none | Token validation and rate limits unchanged |
| Backend-to-backend caller | `caselaw-api` | confidential service account | none | Unchanged; never enters the browser flow |
| Landing pages | none | public | none | No integration required |
| ETL, Postgres and internal workers | none | private service credentials | none | No integration required |
| Airflow UI | its own operator auth | separate administrative surface | none | Do not attach to the user realm as part of this rollout |

All interactive clients share the issuer:

```text
https://auth.caselawexplorer.tech/realms/caselaw
```

Each keeps its own client ID, callback and session secret/storage namespace.
Sharing an issuer creates SSO; sharing a client ID or session secret creates
ambiguity and, for server sessions, a privilege boundary failure.

---

## 4. Case Law Explorer platform

The Explorer platform is the reference path. Its SvelteKit server already
redirects `GET /auth/login` to Keycloak, stores state and the PKCE verifier in
an httpOnly transaction cookie, handles `GET /auth/callback`, and stores the
result in server-only cookies. No refresh token is readable by page script.

Production values in the `caselaw-coolify` resource:

```env
FRONTEND_AUTH_PROVIDER=oidc
REQUIRE_FRONTEND_AUTH=true
FRONTEND_PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
FRONTEND_PUBLIC_AUTH_CLIENT_ID=caselaw-frontend
FRONTEND_PUBLIC_AUTH_REDIRECT_URI=https://app.caselawexplorer.tech/auth/callback
FRONTEND_PUBLIC_AUTH_STORAGE_KEY=caselaw:frontend:auth
AUTH_SESSION_SECRET=<unique random value>
AUTH_SESSION_TTL=28800
```

The demo deployment uses
`https://demo-app.caselawexplorer.tech/auth/callback`. Local development may
use the registered localhost callback. `AUTH_SESSION_SECRET` belongs only to
the Explorer platform; do not copy the access console or workbench secret.

The platform's old Supabase email-code page is a fallback selected only by
`FRONTEND_AUTH_PROVIDER=supabase`. With `oidc`, the “Sign in to explore” action
navigates to `/auth/login`, and the shared Keycloak page supplies email OTP and
magic-link choices. Do not add a second OTP form to the platform's OIDC branch.

The API proxy continues to attach the user's current access token or its own
API credential as already configured. Passwordless sign-in changes the first
authentication step, not the API authorization or access-control path.

---

## 5. Other interactive services

### Access console

```env
ACCESS_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
ACCESS_AUTH_CLIENT_ID=caselaw-access
ACCESS_PUBLIC_AUTH_REDIRECT_URI=https://access.caselawexplorer.tech/auth/callback
ACCESS_PUBLIC_AUTH_POST_LOGOUT_REDIRECT_URI=https://access.caselawexplorer.tech/
ACCESS_SESSION_SECRET=<unique random value>
```

The FastAPI server starts OIDC at `/auth/login`, finishes it at
`/auth/callback`, and checks `admin` after identity verification. OTP and magic
links do not weaken that role check. Step-up requests using `max_age` also use
the passwordless flow and require the user to prove access to email again when
the SSO authentication is too old.

### Database workbench

```env
SQL_RUNNER_UI_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
SQL_RUNNER_UI_AUTH_CLIENT_ID=caselaw-db-workbench
SQL_RUNNER_UI_AUTH_REDIRECT_URI=https://demo-db.caselawexplorer.tech/auth/callback
SQL_RUNNER_UI_REQUIRED_ROLE=admin
SQL_RUNNER_UI_SESSION_SECRET=<unique random value>
```

The workbench remains double-gated: Keycloak proves identity and the workbench
requires `admin`; its server still signs SQL requests separately. A successful
email challenge is not permission to run SQL by itself.

### Citations API docs/account UI

The UI needs the dedicated public `citations-api` client added by this change:

```env
API_PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
API_PUBLIC_AUTH_REDIRECT_URI=https://demo-api.caselawexplorer.tech/auth/callback
```

The production API domain uses its matching callback. The Coolify bundle fixes
`PUBLIC_AUTH_CLIENT_ID=citations-api` and
`PUBLIC_AUTH_STORAGE_KEY=caselaw:citations-api:auth` at both image-build and
container-runtime boundaries. These are estate invariants, so a stored legacy
`caselaw-api` value cannot override them. Verify the deployed container rather
than trusting the panel:

```bash
curl -fsS https://demo-api.caselawexplorer.tech/api/config | jq .auth
```

The two clients are intentionally different:

- `citations-api` is public, has standard flow and PKCE, and may redirect a
  browser;
- `caselaw-api` is confidential, has standard flow off and service accounts on,
  and has no redirect URI.

Turning standard flow on for the machine client to make the UI work would mix
two trust models and put a confidential client in a browser-facing role.

---

## 6. APIs and machine clients

OTP and magic links authenticate people at Keycloak. They do not authenticate
API requests directly.

The Citations API continues to accept the existing credential types:

- a signed Keycloak access token representing a person; or
- a Case Law API key representing a plan/project credential.

`caselaw-access` still validates identity and enforces plan, endpoint and quota
rules. JWT verification still pins the realm issuer and signing key. Do not add
OTP codes or magic-link tokens as bearer-token alternatives; both are short
login credentials intended only for Keycloak.

The confidential `caselaw-api` client remains available for a backend acting as
itself. Direct access grants stay off everywhere. No service should collect an
email and password and exchange them for a token.

---

## 7. Production rollout

### 7.1 Preconditions

1. Confirm every intended user has a unique email, is enabled, and can receive
   mail at that address.
2. Configure SMTP under **Realm settings → Email** and send a test message.
3. Confirm the relay authorizes the configured From domain and that SPF, DKIM
   and DMARC are valid.
4. Keep one signed-in Keycloak administrator session open in a separate
   browser until end-to-end verification is complete.
5. Record the current **Authentication → Bindings → Browser flow** value for
   rollback.

### 7.2 Deploy the provider image

Deploy this repository's image before changing the flow. Its build installs the
pinned Phase Two provider and runs `kc.sh build`. The Keycloak startup log must
show both `ext-email-otp` and `ext-magic-form` providers.

Do not bind a flow containing those executions before the new image is live;
older containers do not know the provider IDs.

### 7.3 Apply an existing realm

This is the required activation step. Deploying the provider, configuring SMTP, and
configuring applications do not enable OTP. An operator must either run
`scripts/apply-passwordless-flow.mjs` or explicitly enable automatic apply; the
realm keeps its current password flow until one of those actions succeeds.

`--import-realm` creates a missing realm and skips an existing one. The supplied
realm contains the custom flow but keeps Keycloak's built-in `browser` password
flow bound. Existing realms also remain unchanged unless an operator opts in.

For a dedicated passwordless deployment, the image can close that gap on startup:
its static configurator authenticates to the loopback Admin API with the existing
`KEYCLOAK_ADMIN` credentials, creates or validates the flow and client, and binds
the flow. It runs only when explicitly enabled and is idempotent.

The compose defaults are:

```env
CASELAW_PASSWORDLESS_AUTO_APPLY=false
CASELAW_PASSWORDLESS_APPLY_TIMEOUT_SECONDS=180
KEYCLOAK_REALM=caselaw
KEYCLOAK_ADMIN_REALM=master
```

Leave `CASELAW_PASSWORDLESS_AUTO_APPLY=false` for the default password mode. Set
it to `true` only after completing the SMTP, user and rollback preconditions in
[OTP_SETUP.md](OTP_SETUP.md).

Configuration failure never stops Keycloak. The container logs a warning and
keeps the previous browser flow available, so a stale or rotated administrator
credential cannot turn a configuration problem into an identity outage.

To opt in manually, run the conservative installer from a Node 18+ operator
environment:

```bash
KEYCLOAK_URL=https://auth.caselawexplorer.tech \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD='...' \
node scripts/apply-passwordless-flow.mjs
```

Both installers perform these operations:

- verifies both provider IDs are installed;
- creates or validates the nested passwordless flow;
- creates or validates the public `citations-api` UI client;
- sets the login-action/OTP lifetime to 600 seconds;
- binds the flow at realm level so every interactive client receives it;
- refuses to overwrite an existing flow or client that has drifted.

For a new environment, `realm/caselaw-realm.json` already contains the same flow,
timeouts and clients, but deliberately binds `browser` until an operator opts in.

### 7.4 Align product configuration

Verify the values in the service matrix, especially:

- Explorer has `FRONTEND_AUTH_PROVIDER=oidc` and client
  `caselaw-frontend`;
- the Citations API UI has client `citations-api`, not `caselaw-api`;
- access and workbench use their own client IDs and unique session secrets;
- every deployed callback exists in the corresponding client's redirect list.

Redeploy a product only when its environment is wrong. The Explorer, access
console and workbench do not need a code release merely to render the new realm
flow.

### 7.5 Export the live realm

After the rollout succeeds, partial-export the realm with clients, groups and
roles and compare it with `realm/caselaw-realm.json`. The checked-in realm is a
safe reusable baseline and must keep `"browserFlow": "browser"`; do not replace
that default merely because one production realm opted in. Preserve the raw live
export as an access-controlled operational artifact, and commit reusable flow,
client or policy changes only after normalizing the binding back to `browser`.
Record `CASELAW_PASSWORDLESS_AUTO_APPLY=true` in that environment's deployment
configuration so disaster recovery reapplies the intentional production binding.

---

## 8. End-to-end verification

Test with a non-admin researcher first, then an administrator.

### Realm behavior

- [ ] Enter a known email and complete a six-digit OTP sign-in.
- [ ] Request a second code and confirm an older code is not accepted in the
      new authentication session.
- [ ] Confirm a code fails after 10 minutes.
- [ ] Sign out, request a magic link, and open it on the same device.
- [ ] Request another link and open it on a second device.
- [ ] Confirm a redeemed link cannot be reused.
- [ ] Confirm a link fails after 10 minutes.
- [ ] Enter an unknown email: the browser must not disclose whether it exists,
      no account may be created, and no email should be sent.
- [ ] Repeated invalid OTPs must produce login-error events and eventually
      trigger the configured brute-force defense.

### Estate behavior

- [ ] Sign in to Case Law Explorer and reach the research workspace.
- [ ] In the same browser, open the access console and confirm SSO avoids a
      second email challenge while the realm session is fresh.
- [ ] Confirm a researcher cannot enter an admin-only console or workbench.
- [ ] Confirm an administrator can enter both.
- [ ] Complete the Citations API UI callback with client `citations-api`.
- [ ] Make an Explorer API call after sign-in and after the access token has
      refreshed; both must keep the same Keycloak subject.
- [ ] Use an existing API key without a browser session; it must remain valid.
- [ ] Obtain/use a service-account token through `caselaw-api`; it must remain
      independent of the browser flow.
- [ ] Sign out from one interactive product, then revisit another and verify
      the Keycloak SSO session has ended.

### Observability

- [ ] Keycloak login events distinguish successful and failed challenges.
- [ ] SMTP delivery, bounce and complaint telemetry is visible.
- [ ] No OTP, magic-link token, access token or refresh token appears in
      application logs.
- [ ] Callback failures are separated from API authorization failures.

---

## 9. Rollback

Changing the browser-flow binding is the rollback boundary. In the admin
console, restore the value recorded before rollout under
**Authentication → Bindings → Browser flow**. Do not delete users, clients or
the new flow during an incident; leaving an unbound flow is harmless and makes
forensics and a corrected rollout easier.

If the previous flow requires passwords, first confirm affected users actually
have password credentials. Users migrated from an email-only identity system
may not, so preserving the product's temporary `supabase` or `none` escape
hatch during the first rollout can be safer than an immediate password-flow
rollback.

Existing OIDC sessions and API keys are not rewritten by this change. A realm
session created before rollback may continue until it expires or is signed out.
Use the realm's session revocation only if the incident requires it; that signs
every product out.

---

## 10. Security and operations

**SMTP is part of authentication availability.** A relay outage now prevents a
new passwordless sign-in. Monitor send failures and delivery latency, keep an
administrator break-glass path, and do not treat “test email succeeded once” as
ongoing monitoring.

**Protect the send step from abuse.** Realm brute-force protection limits bad
codes; it does not by itself prevent repeated new login sessions from sending
mail. Rate-limit the public authorization endpoint at the edge and consider the
provider's Turnstile step before opening self-service sign-in to an untrusted
audience. Never reveal whether a requested address exists.

**Email is the first factor.** Anyone controlling the mailbox can sign in. Use
step-up policy, a federated institutional identity provider, TOTP or WebAuthn
for operations whose risk is higher than mailbox possession. The `admin` role
must still be checked server-side.

**Links are credentials.** Email scanners may open links before a person does.
Single-use and a short lifetime limit exposure, but test the organization's
mail-security gateway. OTP remains the fallback when a scanner consumes a
link.

**Do not log secrets.** Query strings for magic links contain action tokens.
Exclude or redact the action-token route in proxies, analytics and error
reporting. OTP values must not appear in support logs or metrics.

**Pin and review the provider.** `MAGIC_LINK_VERSION` is part of the production
security boundary. Test it against the pinned Keycloak version before either is
upgraded, review upstream release notes, and keep the image build reproducible.

---

## 11. Troubleshooting

**The old password form still appears.** The image may be new while the live
realm binding is old. Realm import does not update an existing realm. Check
**Authentication → Bindings**, or run the apply script.

**Keycloak says an authenticator is unknown.** The flow was applied before the
provider image. Roll back the binding, deploy the image, confirm the provider
IDs in startup logs, then apply again.

**No email arrives.** Use the realm's Send test email first. Then check the
user is enabled and has a valid email, the relay logs, From-domain policy,
spam/quarantine and bounce telemetry. Unknown users intentionally receive no
message.

**The code form appears but no alternative method is available.** Confirm the
flow has the required nested `Case Law email methods` subflow. OTP and magic
link must be alternatives inside it, not siblings of the required username
form.

**A callback ends with `invalid_redirect_uri`.** The product sent a callback
that is not registered exactly on its own client. Check scheme, domain, port,
path and trailing slash.

**The Citations API UI cannot start login.** Confirm it uses public client
`citations-api`. `caselaw-api` has standard flow disabled by design and cannot
serve a browser callback.

**A user signs in but is forbidden.** Authentication succeeded; authorization
did not. Check realm/client roles and `caselaw-access` policy. Do not “fix” this
by changing OTP or creating a second user.

**A magic link is already expired on first click.** A mail-security scanner may
have redeemed it. Check gateway logs and use the email OTP path while adjusting
scanner policy.
