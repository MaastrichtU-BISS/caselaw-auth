# Add optional email OTP to a project

This guide starts with a project that needs sign-in and ends with a working
six-digit email OTP flow. It covers both the shared `caselaw` realm and a project
using a different realm.

Username/email plus password is the default. Email OTP and magic link are enabled
only when a realm administrator explicitly changes that realm's browser-flow
binding.

## Required activation step

> **For a new or different realm, a realm administrator must run
> `scripts/apply-passwordless-flow.mjs`.** Configuring SMTP, creating a user, and
> connecting the project do not enable OTP by themselves. The script creates and
> validates the passwordless flow, then binds it to the target realm. Until it is
> run, the realm continues to show the default username/password login.

The shared production `caselaw` realm is the exception for project developers: its
operator has already run the installer. A project joining that realm only needs its
own OIDC client and application configuration.

## Start here: which setup are you doing?

| Your project uses | What you need to do |
|---|---|
| Existing `caselaw` realm | Create an OIDC client for the project, configure the project, and test. The realm, SMTP, theme, OTP flow and users already exist. |
| A different realm on the Case Law Keycloak server | Configure SMTP and users, create the client, configure the project, and **run the installer script** with `CASELAW_PASSWORDLESS_ESTATE_MODE=false`. |
| A different Keycloak server | Deploy this repository's Keycloak image first, then follow the different-realm path. The OTP provider and the Case Law and DigiMach themes are installed at server level by the image. |

If you only remember one rule, remember this one: the issuer, SMTP configuration,
users, browser-flow binding, and OIDC client must all belong to the **same target
realm**.

## The three pieces

OTP setup spans three different scopes. They are configured separately:

```text
Keycloak server
  └─ OTP/magic-link provider JAR and repository themes
       └─ target realm
            ├─ SMTP, users, OTP flow and browser-flow binding
            └─ project OIDC client
                 └─ project
                      ├─ issuer and client ID
                      ├─ login/callback/logout routes
                      └─ local session
```

| Scope | Configured once per | Owns |
|---|---|---|
| Keycloak server | Keycloak installation | Provider code and theme files |
| Realm | Realm | Users, SMTP, authentication flow, sessions and roles |
| Project/client | Application | Redirect URIs, PKCE/client secret, callback and application session |

The application never sends an OTP or validates a code. It starts an ordinary OIDC
authorization-code flow; Keycloak performs the email challenge and returns the same
OIDC authorization code that password login would return.

## Path A: project using the shared `caselaw` realm

Use this path for another Case Law Explorer service whose users should share the
existing production accounts and SSO session.

### A1. Choose the project values

Example values used below:

```text
realm:        caselaw
issuer:       https://auth.caselawexplorer.tech/realms/caselaw
client ID:    my-project
project URL:  https://my-project.caselawexplorer.tech
callback:     https://my-project.caselawexplorer.tech/auth/callback
```

Use a unique lowercase client ID. Do not reuse `caselaw-frontend`, `caselaw-api`, or
another product's client.

### A2. Create the project client in Keycloak

In `https://auth.caselawexplorer.tech/admin`, select realm **caselaw**, then open
**Clients → Create client**.

For a browser-only SPA:

| Setting | Value |
|---|---|
| Client type | OpenID Connect |
| Client ID | `my-project` |
| Client authentication | Off |
| Standard flow | On |
| Direct access grants | Off |
| Service account roles | Off |
| Valid redirect URIs | `https://my-project.caselawexplorer.tech/auth/callback` |
| Valid post logout redirect URIs | `+` |
| Web origins | `+` |
| PKCE method | `S256` |

For a project with a backend, prefer **Client authentication: On**, copy the client
secret into a server-only environment variable, and still use standard flow with
PKCE `S256`. Never expose that secret through a `PUBLIC_`, `VITE_`, or
`NUXT_PUBLIC_` variable.

Add the local callback as a second redirect while developing, for example
`http://localhost:5173/auth/callback`. Redirect matching is exact, including scheme,
port, path and trailing slash.

### A3. Configure the project

For a server-backed application:

```env
AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
AUTH_CLIENT_ID=my-project
AUTH_CLIENT_SECRET=<server-only secret; omit for a public client>
AUTH_REDIRECT_URI=https://my-project.caselawexplorer.tech/auth/callback
AUTH_SESSION_SECRET=<unique long random value>
```

Implement `/auth/login`, `/auth/callback`, and `/auth/logout` using
[SERVER_SIDE_AUTH.md](SERVER_SIDE_AUTH.md). The login route redirects to Keycloak;
the callback exchanges the OIDC code and creates the project's own session.

For a static SPA:

```env
PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
PUBLIC_AUTH_CLIENT_ID=my-project
PUBLIC_AUTH_REDIRECT_URI=https://my-project.caselawexplorer.tech/auth/callback
PUBLIC_AUTH_STORAGE_KEY=my-project:auth
```

Install `caselaw-auth` and implement the callback using
[CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md). A static SPA has no client secret.

Projects in `caselaw-coolify` may use service-specific names instead of the generic
ones. For Case Law Explorer itself the equivalent values are:

```env
FRONTEND_AUTH_PROVIDER=oidc
REQUIRE_FRONTEND_AUTH=true
FRONTEND_PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/caselaw
FRONTEND_PUBLIC_AUTH_CLIENT_ID=caselaw-frontend
FRONTEND_PUBLIC_AUTH_REDIRECT_URI=https://app.caselawexplorer.tech/auth/callback
AUTH_SESSION_SECRET=<unique long random value>
```

### A4. Test

Open the project's login route in a signed-out/private browser. Enter the email of an
existing enabled `caselaw` user, complete the OTP, and confirm the browser returns to
the project's exact callback and creates a session.

You do **not** configure SMTP, copy users, or run the passwordless installer for this
path. The realm operator has already run it and owns those realm-wide production
settings.

## Path B: project using a different realm

Use this path when the project needs an isolated user directory, separate sessions,
different roles, or an independent authentication policy.

The examples use:

```text
Keycloak URL: https://auth.caselawexplorer.tech
target realm: my-project
issuer:       https://auth.caselawexplorer.tech/realms/my-project
client ID:    my-project-web
callback:     https://my-project.example.org/auth/callback
```

Replace all five consistently. An account in `caselaw` does not exist in
`my-project`, even when both realms are on the same Keycloak server.

### B1. Confirm the server has the provider

If the realm is on the Case Law Keycloak deployment, the provider and themes are
already installed at server level. Continue to B2.

For another Keycloak deployment, build and deploy this repository's Docker image.
Its image installs the pinned Phase Two provider and both the `caselaw` and
`digimach` themes before Keycloak starts:

```bash
docker compose up -d --build
```

Do not bind a flow containing `ext-email-otp` or `ext-magic-form` on a vanilla
Keycloak image; those provider IDs do not exist there. Deploy the image first.

### B2. Create or select the target realm

In Keycloak Admin Console, create `my-project` or select the existing realm. Leave
**Authentication → Bindings → Browser flow** set to the built-in `browser` flow for
now. This keeps username/email-and-password login available while setup is tested.

Select the realm's visual identity under **Realm settings → Themes**. Use
`caselaw` for a Case Law realm or `digimach` for a DigiMach realm, setting both
**Login theme** and **Account theme**. The choice applies to every project/client
in that realm. Authentication works without a selection, but uses Keycloak's
default UI; the repository's six-slot OTP presentation comes from either custom
theme. See [THEMES.md](THEMES.md) for realm-wide and project-only instructions.

### B3. Configure SMTP in this realm

Select **my-project**, not `master` and not `caselaw`, then open **Realm settings →
Email**.

1. Enter the From address and optional display name/reply-to address.
2. Enter the relay host and port.
3. Select the relay's transport, normally STARTTLS on 587 or TLS/SSL on 465.
4. Enable authentication and enter the relay username/password when required.
5. Save and use **Test connection**.
6. Confirm the message arrives in the mailbox and check the relay delivery event.

SMTP is realm-scoped. Settings in `master` or `caselaw` do not apply to
`my-project`. Keycloak also masks stored SMTP passwords; copying a realm's visible
`smtpServer` object through the Admin API does not copy the secret. Enter the actual
password in every target realm.

For production, validate SPF, DKIM and DMARC for the From domain and make relay
delivery/bounce telemetry available to operators.

### B4. Create a test user in this realm

Under **Users → Add user**:

- use the colleague's email as username when email-first login is desired;
- set **Email** to the real reachable and unique address;
- enable the user;
- set a password credential so the built-in password flow and rollback can be
  tested;
- assign project roles separately from authentication.

The OTP provider does not create users. An unknown address intentionally reaches a
neutral code screen but receives no message, so seeing that screen does not prove the
user or SMTP configuration is valid.

### B5. Create the project's OIDC client

Still inside realm **my-project**, create client `my-project-web` using the table in
[A2](#a2-create-the-project-client-in-keycloak), substituting this project's callback
and origin. The client and user must be in the same realm named by the issuer.

Before enabling OTP, run the project and complete one password login. This proves
the client ID, callback, PKCE transaction and application session independently of
email delivery.

### B6. Configure the project's issuer

For a server-backed project:

```env
AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/my-project
AUTH_CLIENT_ID=my-project-web
AUTH_CLIENT_SECRET=<server-only secret; omit for a public client>
AUTH_REDIRECT_URI=https://my-project.example.org/auth/callback
AUTH_SESSION_SECRET=<unique long random value>
```

For a static SPA:

```env
PUBLIC_AUTH_ISSUER=https://auth.caselawexplorer.tech/realms/my-project
PUBLIC_AUTH_CLIENT_ID=my-project-web
PUBLIC_AUTH_REDIRECT_URI=https://my-project.example.org/auth/callback
PUBLIC_AUTH_STORAGE_KEY=my-project:auth
```

Changing only `KEYCLOAK_REALM` on the auth server is not enough. The deployed
project's issuer must end in `/realms/my-project`, and its client must exist there.

### B7. Required: run the installer to enable OTP

This step is mandatory. The earlier steps prepare email delivery and OIDC, but the
realm still uses passwords until this command completes successfully.

From a checkout of this repository, run with Node 18 or newer:

```bash
KEYCLOAK_URL=https://auth.caselawexplorer.tech \
KEYCLOAK_REALM=my-project \
KEYCLOAK_ADMIN_REALM=master \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD='...' \
CASELAW_PASSWORDLESS_ESTATE_MODE=false \
node scripts/apply-passwordless-flow.mjs
```

`KEYCLOAK_REALM` is the realm being changed. `KEYCLOAK_ADMIN_REALM` is where the
administrator authenticates—normally `master`. The administrator must have
permission to manage the target realm.

`CASELAW_PASSWORDLESS_ESTATE_MODE=false` is important for an independent realm. It
installs and binds only the generic OTP/magic-link flow; it does not create or
validate `caselaw-frontend`, `citations-api`, or other Case Law estate clients.

For the production `caselaw` realm, estate mode defaults to `true`. It can also be
set explicitly:

```env
CASELAW_PASSWORDLESS_ESTATE_MODE=true
```

The installer:

1. verifies `ext-email-otp` and `ext-magic-form` are installed;
2. creates or validates `caselaw-browser-passwordless`;
3. configures six-digit OTP and ten-minute, single-use magic links;
4. prevents either method from creating unknown users;
5. sets the login-action lifetime to ten minutes;
6. binds the optional flow as the realm's browser flow.

It refuses to overwrite a flow that has drifted. Running this command is the moment
the realm changes from password login to OTP/magic-link login for all interactive
clients in that realm.

Verify the command reports that it bound `caselaw-browser-passwordless` to the target
realm before testing the project.

### B8. Complete the end-to-end test

Restart the login in a private browser so an existing SSO cookie cannot skip the
challenge. Verify all of the following:

- the authorization request uses issuer `/realms/my-project` and client
  `my-project-web`;
- the known enabled user receives a six-digit code;
- typing, deletion, whole-code paste and mobile one-time-code autofill work;
- the code completes the project's registered callback;
- the resulting token has issuer `/realms/my-project` and the expected user `sub`;
- resend produces a new email and only the most recent code is used;
- a wrong or expired code fails without revealing whether an account exists;
- an unknown email creates no user and sends no message;
- roles still allow and deny the intended project areas;
- logging out clears both the project session and the Keycloak SSO session.

## Optional automatic apply

Automatic apply is intended for a dedicated deployment whose target realm should
always use passwordless authentication after a restart. It is off by default.

For the shared estate:

```env
CASELAW_PASSWORDLESS_AUTO_APPLY=true
CASELAW_PASSWORDLESS_ESTATE_MODE=true
KEYCLOAK_REALM=caselaw
KEYCLOAK_ADMIN_REALM=master
```

For an independent realm:

```env
CASELAW_PASSWORDLESS_AUTO_APPLY=true
CASELAW_PASSWORDLESS_ESTATE_MODE=false
KEYCLOAK_REALM=my-project
KEYCLOAK_ADMIN_REALM=master
```

The container configurator uses the same behavior as the Node installer. A failure
is logged but does not stop Keycloak; the previous browser-flow binding remains
active. On a shared Keycloak deployment serving multiple realms, prefer the explicit
operator command because one container-level `KEYCLOAK_REALM` can target only one
realm.

## What “optional” means

Optional means the repository and new realms default to password login, and each
realm administrator chooses whether to bind the passwordless flow.

The supplied flow offers **Email OTP** and **Magic link** as alternatives to each
other. It does not currently offer password as a third choice on the same page and
it is not enabled per client or per user. If one realm needs password login while
another needs OTP, use separate realms and bind a different browser flow in each.

## Roll back to password login

1. In the target realm, open **Authentication → Bindings**.
2. Set **Browser flow** to the built-in `browser` flow and save.
3. Set `CASELAW_PASSWORDLESS_AUTO_APPLY=false` if automatic apply was enabled.
4. Redeploy/restart if deployment configuration changed.
5. Test with a user that has a password credential.

Do not delete the unbound passwordless flow during an incident. Leaving it present
is harmless and makes investigation or later re-enablement easier. Existing SSO
sessions may remain valid until logout or expiry.

The checked-in `realm/caselaw-realm.json` must keep
`"browserFlow": "browser"` as its portable default. Record production opt-in in
deployment configuration instead of committing a live passwordless binding over the
default realm baseline.

## Troubleshooting by symptom

### The OTP page appears, but no email arrives

1. Verify the address belongs to an enabled user in the target realm.
2. Run **Realm settings → Email → Test connection** in that same realm.
3. Re-enter the SMTP password; a copied masked value is not a usable secret.
4. Inspect relay accepted, delivered, deferred and bounced events.
5. Check spam/quarantine and SPF, DKIM and DMARC.
6. Request one new code and use only the newest message.

### The password form still appears

Check the target realm's **Authentication → Bindings → Browser flow**. Deploying the
provider image, configuring SMTP, or connecting the application does not change the
binding. Run `scripts/apply-passwordless-flow.mjs`, then verify the binding is
`caselaw-browser-passwordless`. Also verify that the application issuer names the
realm you changed rather than another realm.

### The installer complains that Case Law clients are missing

The command is running in estate mode against an independent realm. Set:

```env
CASELAW_PASSWORDLESS_ESTATE_MODE=false
```

Then rerun it. This skips only estate-specific client reconciliation; it does not
skip provider, flow, timeout or binding checks.

### Keycloak reports an unknown authenticator

The server does not have the Phase Two provider, or the flow was bound before the
provider image started. Restore `browser`, deploy this repository's image, and run
the installer again.

### OTP succeeds, but the project rejects the callback

SMTP and OTP worked. Check that the authorization request, Keycloak client and
project environment use the same realm and client ID. Then compare the exact
callback URI, scheme, host, port, path and trailing slash. Also verify the state and
PKCE transaction cookie survived the redirect.

### The callback works, but the user is forbidden

Authentication and authorization are separate. Check realm/client roles and the
project's access policy. Do not change OTP settings or create a duplicate user to
fix a missing role.

### A magic link is expired before the user opens it

Mail-security scanners can consume single-use links. Check gateway logs and use OTP
while adjusting scanner policy.

For the complete Case Law estate architecture and operational controls, see
[PASSWORDLESS_ROLLOUT.md](PASSWORDLESS_ROLLOUT.md).
