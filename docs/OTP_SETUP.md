# Configure optional email OTP

This guide covers two cases: connecting a project to the already configured shared
`caselaw` realm, and enabling OTP in another realm. Before OTP is enabled, a new
realm uses Keycloak's password flow. After OTP is enabled, a person enters only an
email address and the emailed code. Submitting a new address creates a pending,
unverified email-only user; completing the code verifies and signs in that user. No
name or password form is shown.

## Choose your path

| Situation | Follow |
|---|---|
| Your project will use the production `caselaw` realm | [Path A](#path-a-project-using-the-shared-caselaw-realm). OTP is already enabled; do not run an installer. |
| Your project has another realm on the deployed Case Law Keycloak server | Follow the [administrator checklist](#administrator-checklist-deployed-keycloak-new-realm), then [Path B](#path-b-project-using-a-different-realm) for the detailed settings. |
| You operate another Keycloak server | First deploy this repository's Keycloak image, then follow the same administrator checklist and Path B. |

Keep every realm-scoped item together: SMTP, users, the authentication-flow binding,
and the project's OIDC client must be in the realm named by the project's issuer.

## Two installations are involved

These are separate operations with different permissions:

1. **Install the provider on the Keycloak server — once per server.** A deployment
   operator deploys this repository's Keycloak image. A realm administrator cannot
   do this from the Admin Console. It is already done on the Case Law Keycloak
   server.
2. **Enable the flow in a realm — once per realm.** After SMTP and the client are
   ready, a realm administrator runs the published `caselaw-auth` CLI from their own
   computer. The CLI calls the deployed Keycloak Admin API over HTTPS. No repository
   clone or Keycloak-host shell is needed.

The Admin Console configures SMTP, themes, and clients, but it does not run the CLI.
Configuring those items alone leaves the built-in password flow active.

## Administrator checklist: deployed Keycloak, new realm

Use this checklist if you have Keycloak administrator access but have not cloned
this repository.

Requirements:

- Keycloak administrator credentials with permission to manage the target realm;
- Node.js 18 or newer on your computer;
- the target Keycloak URL and realm name;
- confirmation from the deployment operator that `caselaw-email-identity`,
  `ext-email-otp`, and `ext-magic-form` are installed on the server.

Then complete these steps in order:

1. In the Admin Console, create or select the target realm. Leave
   **Authentication → Bindings → Browser flow** set to `browser` for now.
2. In that realm, configure **Realm settings → Email**, save it, and click
   **Test connection**. Do not continue until the test email arrives.
3. In that realm, create the project's OIDC client with its exact callback URL.
4. Configure the project to use this realm's issuer and client ID.
5. Choose a real mailbox that is not already a user in the realm. This will test
   account creation as well as sign-in; do not create the user manually.
6. On your own computer, open a terminal and set the values below. Obtain the admin
   password from your secret manager; do not paste a real password into a command
   that will be saved in shell history.

   ```bash
   export KEYCLOAK_URL=https://auth.caselawexplorer.tech
   export KEYCLOAK_REALM=my-project
   export KEYCLOAK_ADMIN_REALM=master
   export KEYCLOAK_ADMIN=admin
   export KEYCLOAK_ADMIN_PASSWORD='<set securely>'
   export CASELAW_PASSWORDLESS_ESTATE_MODE=false
   ```

7. Still in that terminal, run the published installer:

   ```bash
   npx --yes caselaw-auth@0.6.2 apply-passwordless-flow
   ```

   It downloads the pinned package, gets a short-lived admin token, creates or
   validates the flow in `KEYCLOAK_REALM`, makes the realm's built-in `firstName`
   and `lastName` profile attributes optional, binds the flow, and exits. It
   installs nothing globally on your computer and changes nothing on the Keycloak
   host filesystem.
8. Confirm the command ends with `Bound caselaw-browser-passwordless-email-first`. In the Admin
   Console, refresh **Authentication → Bindings** and confirm **Browser flow** is
   `caselaw-browser-passwordless-email-first`. Confirm **Realm settings → Login → User
   registration** is off. Under **Realm settings → User profile**, confirm first
   name and last name are not required. The separate registration form and required
   profile fields would otherwise ask for names or a password.
9. Remove the password from the terminal environment:

   ```bash
   unset KEYCLOAK_ADMIN_PASSWORD
   ```

If step 7 reports that a provider is missing, stop and ask the Keycloak deployment
operator to deploy the repository image. Re-running the command cannot install a
server provider.

Now test the chosen new mailbox in a private browser: enter the email, enter the
six-digit code, and confirm the application callback succeeds. Under **Users**, the
new account must have the email as both username and email, **Email verified** on,
no first or last name, and no password credential. A later login uses the same email
and another code. Roles and product access remain a separate administrator decision.

## What the project does

The application never sends an OTP or validates a code. It starts a normal OIDC
authorization-code flow. Keycloak emails and checks the code, then returns the same
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

Open the project's login route in a signed-out/private browser. Enter an email,
complete the OTP, and confirm the browser returns to the project's exact callback
and creates a session. If the email is new, the shared realm creates the account only
through the email challenge: submitting the address creates a pending email-only
user, and completing it verifies and signs in that user. No name or password form is
shown.

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
Its image builds the Case Law email-identity authenticator, installs the pinned Phase
Two OTP/magic-link provider, and installs both the `caselaw` and `digimach` themes
before Keycloak starts:

```bash
docker compose up -d --build
```

Do not bind a flow containing `caselaw-email-identity`, `ext-email-otp`, or
`ext-magic-form` on a vanilla Keycloak image; those provider IDs do not exist there.
Deploy the repository image first.

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

### B4. Choose a new-user test mailbox

Choose a real, reachable email address that does not already exist under **Users** in
this realm. Do not create it manually and do not assign a password. After the
installer is applied, submitting the email creates an enabled but unverified
user. Successful verification then marks that user email-verified and signs them in.
The completed account has:

- the email address as both username and email;
- **Email verified** enabled;
- no first name or last name;
- no password credential.

Authentication does not grant product permissions. Assign any required realm or
client roles after the account exists, or automate that as a separate access-policy
workflow.

### B5. Create the project's OIDC client

Still inside realm **my-project**, create client `my-project-web` using the table in
[A2](#a2-create-the-project-client-in-keycloak), substituting this project's callback
and origin. The client and newly created user will be in the same realm named by the
issuer.

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

### B7. Required: run the published installer to enable OTP

This step is mandatory. The earlier steps prepare email delivery and OIDC, but the
realm still uses passwords until this command completes successfully.

On any machine with Node 18+ and network access to Keycloak, run the pinned npm
package. No repository checkout or shell access to the Keycloak server is needed:

```bash
KEYCLOAK_URL=https://auth.caselawexplorer.tech \
KEYCLOAK_REALM=my-project \
KEYCLOAK_ADMIN_REALM=master \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD='...' \
CASELAW_PASSWORDLESS_ESTATE_MODE=false \
npx --yes caselaw-auth@0.6.2 apply-passwordless-flow
```

Supply the password through a secret manager or a temporary environment variable;
do not leave a real administrator password in shell history. The command downloads
the pinned package, obtains an admin token from `KEYCLOAK_URL`, changes
`KEYCLOAK_REALM` through the Admin API, and exits. It does not install anything on
the Keycloak host.

Repository operators may use the equivalent checkout command:

```bash
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

The installer changes only the realm named by `KEYCLOAK_REALM`. It:

1. verifies `caselaw-email-identity`, `ext-email-otp`, and `ext-magic-form` are installed;
2. creates or validates `caselaw-browser-passwordless-email-first`;
3. configures six-digit OTP and ten-minute, single-use magic links;
4. uses the Case Law email-identity step to resolve or create a pending email-only
   user; only a successful OTP or magic-link challenge verifies and signs in that
   user;
5. disables Keycloak's separate registration form, so a password is not requested;
6. removes Keycloak's default `user` requirement from the built-in `firstName` and
   `lastName` user-profile attributes, while leaving those attributes available as
   optional metadata;
7. sets the login-action lifetime to ten minutes;
8. binds the optional flow as the realm's browser flow.

It refuses to overwrite a flow, estate client, or custom name-field requirement that
has drifted. If your realm deliberately requires names for selected roles or scopes,
decide whether to remove that policy under **Realm settings → User profile** before
rerunning; the CLI will not silently weaken it. Running this command is the moment
the realm changes from password login to OTP/magic-link login for all interactive
clients in that realm.

The installer deliberately uses new `email-first` aliases and leaves an older
`caselaw-browser-passwordless` flow unbound. This allows an in-place upgrade without
deleting the previous flow and keeps that flow available as a rollback artifact.

Verify the command reports that it bound `caselaw-browser-passwordless-email-first` to the target
realm before testing the project.

### B8. Complete the end-to-end test

Restart the login in a private browser so an existing SSO cookie cannot skip the
challenge. Verify all of the following:

- the authorization request uses issuer `/realms/my-project` and client
  `my-project-web`;
- a previously unknown email receives a six-digit code;
- typing, deletion, whole-code paste and mobile one-time-code autofill work;
- the code completes the project's registered callback;
- the resulting token has issuer `/realms/my-project` and the expected user `sub`;
- resend produces a new email and only the most recent code is used;
- a wrong or expired code fails without revealing whether an account exists;
- successful OTP verification leaves exactly one enabled, email-verified user with
  no names and no password credential;
- the same email signs in again without creating a duplicate user;
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
realm administrator chooses whether to apply the passwordless flow. Applying it
also enables first-use email account creation and disables the separate Keycloak
registration form for that realm. It also makes first and last name optional in the
realm user profile so Keycloak's post-login **Verify Profile** action cannot reinsert
a name form after a successful OTP. A send request can leave an enabled but
unverified user when the person abandons the challenge or delivery fails. Monitor
and, where required by policy, periodically remove stale unverified accounts.

The supplied flow offers **Email OTP** and **Magic link** as alternatives to each
other. It does not currently offer password as a third choice on the same page and
it is not enabled per client or per user. If one realm needs password login while
another needs OTP, use separate realms and bind a different browser flow in each.

## Roll back to password login

1. In the target realm, open **Authentication → Bindings**.
2. Set **Browser flow** to the built-in `browser` flow and save.
3. Set `CASELAW_PASSWORDLESS_AUTO_APPLY=false` if automatic apply was enabled.
4. Redeploy/restart if deployment configuration changed.
5. Test with an older user that already has a password credential.

The browser-flow rollback does not make first and last name required again. They are
harmless optional attributes in password mode. If the previous realm policy required
them, restore the recorded requirements under **Realm settings → User profile** only
after confirming that doing so will not strand existing email-only accounts.

Users created by the email-only flow have no password and cannot sign in through the
rolled-back password flow. During rollback, keep existing SSO sessions available and
provide an administrator-assisted recovery path for those users.

Do not delete the unbound passwordless flow during an incident. Leaving it present
is harmless and makes investigation or later re-enablement easier. Existing SSO
sessions may remain valid until logout or expiry.

The checked-in `realm/caselaw-realm.json` must keep
`"browserFlow": "browser"` as its portable default. Record production opt-in in
deployment configuration instead of committing a live passwordless binding over the
default realm baseline.

## Troubleshooting by symptom

### The OTP page appears, but no email arrives

1. Run **Realm settings → Email → Test connection** in the target realm.
2. Re-enter the SMTP password; a copied masked value is not a usable secret.
3. Inspect relay accepted, delivered, deferred and bounced events.
4. Check spam/quarantine and SPF, DKIM and DMARC.
5. Request one new code and use only the newest message.

### The old Register link or name/password form appears

The installer disables **Realm settings → Login → User registration** because new
accounts are created through the email challenge instead. It also makes the built-in
first and last name profile attributes optional so **Verify Profile** does not ask for
them after OTP. Run version `0.6.2` of the installer, then refresh the login in a
private browser. Also confirm the application points to the realm you changed. If
the CLI reports a custom name-field requirement, review and remove that realm policy
manually; the installer deliberately refuses to overwrite it.

### The password form still appears

Check the target realm's **Authentication → Bindings → Browser flow**. Deploying the
provider image, configuring SMTP, or connecting the application does not change the
binding. Run `npx --yes caselaw-auth@0.6.2 apply-passwordless-flow` with the
environment variables from B7, then verify the binding is
`caselaw-browser-passwordless-email-first`. Also verify that the application issuer names the
realm you changed rather than another realm.

### The installer complains that Case Law clients are missing

The command is running in estate mode against an independent realm. Set:

```env
CASELAW_PASSWORDLESS_ESTATE_MODE=false
```

Then rerun it. This skips only estate-specific client reconciliation; it does not
skip provider, flow, timeout or binding checks.

### Keycloak reports an unknown authenticator

The server does not have this repository's email-identity provider and Phase Two
email provider, or the flow was bound before the image started. Restore `browser`,
deploy this repository's image, confirm all three provider IDs, and run the installer
again.

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
