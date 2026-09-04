# Optional email OTP and magic-link setup

This is the colleague-facing setup guide for adding email OTP and magic links to a
Case Law Keycloak realm. It is deliberately opt-in: a new realm and a default
Compose deployment use Keycloak's built-in username/email-and-password browser flow.
Nothing in an application needs OTP-specific code.

Use this guide when you administer the realm. Product developers who only need to
connect an application should use [SERVER_SIDE_AUTH.md](SERVER_SIDE_AUTH.md) or
[CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md).

## 1. Choose the sign-in mode

There are two realm-level modes:

| Mode | Browser-flow binding | Requirements |
|---|---|---|
| Username/email + password (default) | `browser` | User has a password credential |
| Email OTP + magic link (optional) | `caselaw-browser-passwordless` | User has a unique reachable email; realm SMTP works |

The choice applies to every interactive OIDC client in that realm. It does not
change service accounts, API keys, roles, access plans, stable user IDs (`sub`), or
existing application integration. It is not a per-application switch.

The supplied passwordless flow offers OTP and magic link as alternatives to each
other. It does not show password as a third choice on the same screen. To return to
passwords, bind the built-in `browser` flow again as described in [Rollback](#8-rollback).

## 2. Prerequisites

Before enabling the optional flow, confirm all of the following:

- the deployed Keycloak image comes from this repository and contains the pinned
  Phase Two provider;
- you can administer the target realm and the `master` realm credentials are
  available to the installer;
- every intended user is enabled and has a unique, correctly spelled email address;
- those users have password credentials if password rollback must work immediately;
- you have a separate signed-in administrator session for recovery;
- the SMTP relay permits the intended From address/domain;
- you know the currently bound browser flow.

The realm file contains the passwordless flow definition but leaves it unbound. The
Compose default is also `CASELAW_PASSWORDLESS_AUTO_APPLY=false`. Merely deploying the
image therefore does not change how colleagues sign in.

## 3. Configure SMTP in the target realm

SMTP settings are realm-scoped. Configuration in `master` does not configure
`caselaw`, staging, or any other realm.

In Keycloak Admin Console:

1. Select the realm that will send the OTP, such as `caselaw`.
2. Open **Realm settings → Email**.
3. Set the From address and, when required, From display name, Reply-To address, and
   envelope-from address.
4. Set the SMTP host and port supplied by the relay.
5. Select the relay's required transport: usually STARTTLS on port 587 or TLS/SSL on
   port 465. Do not enable both unless the provider explicitly requires it.
6. Enable authentication and enter the SMTP username and password when required.
7. Save, then use **Test connection** and confirm the message reaches the actual
   mailbox—not merely that Keycloak reports a successful socket connection.

Keycloak masks a saved SMTP password in Admin API responses. Copying the visible
`smtpServer` object from one realm to another does **not** copy the secret; enter the
password separately in every realm. This is a common reason the OTP form appears but
no email arrives.

For production delivery, also verify SPF, DKIM and DMARC for the From domain and
inspect the relay's delivery/bounce log. A Keycloak send success only proves that the
relay accepted the message.

## 4. Prepare users

For each colleague, open **Users**, select the account, and verify:

- **Enabled** is on;
- **Email** is present and unique within the realm;
- the address is the mailbox they can currently access;
- required actions will not unexpectedly interrupt the callback;
- roles and access-plan assignments are correct independently of authentication.

The authenticators never create a missing account. An unknown address intentionally
continues to a neutral-looking code screen but sends no message, preventing account
enumeration. Seeing the code screen is therefore not proof that SMTP sent anything.

## 5. Enable the optional flow

### Recommended: explicit operator command

Deploy the provider image first, then run from this repository with Node 18 or newer:

```bash
KEYCLOAK_URL=https://auth.caselawexplorer.tech \
KEYCLOAK_REALM=caselaw \
KEYCLOAK_ADMIN_REALM=master \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD='...' \
node scripts/apply-passwordless-flow.mjs
```

The command is idempotent. It verifies the provider IDs, creates or validates the
nested flow, creates or validates the public `citations-api` client, sets the login
action lifetime to ten minutes, and binds `caselaw-browser-passwordless`. It refuses
to overwrite drift rather than guessing.

### Dedicated deployment: automatic apply

Set this only after the SMTP and user checks above:

```env
CASELAW_PASSWORDLESS_AUTO_APPLY=true
CASELAW_PASSWORDLESS_APPLY_TIMEOUT_SECONDS=180
KEYCLOAK_REALM=caselaw
KEYCLOAK_ADMIN_REALM=master
```

Redeploy Keycloak. On each start, the static configurator validates and binds the
flow. A configurator failure is logged but does not stop Keycloak; the previous
browser-flow binding remains active.

### Admin Console

If the flow already exists, it can be selected manually under
**Authentication → Bindings → Browser flow**. Choose
`caselaw-browser-passwordless` and save. Do not try to recreate the nested execution
tree by hand unless following [PASSWORDLESS_ROLLOUT.md](PASSWORDLESS_ROLLOUT.md);
requirements on the nested subflows are significant.

## 6. What applications must configure

Nothing OTP-specific. Every interactive product continues to use OIDC authorization
code flow with PKCE against the same realm issuer. It redirects to Keycloak and
receives the same tokens after either sign-in mode.

Check only the ordinary OIDC contract:

- the application uses its own public client ID;
- standard flow is enabled and direct access grants are disabled;
- PKCE method is `S256`;
- the callback URI matches exactly;
- server-backed applications keep sessions in secure httpOnly cookies;
- machine client `caselaw-api` remains confidential and never enters this browser
  flow.

The OTP page's six visible cells are a presentation layer over one real input named
`otp`. That preserves Keycloak/provider submission, full-code paste, mobile
`autocomplete="one-time-code"`, numeric keyboards, screen-reader labeling, and a
no-JavaScript fallback. Do not replace it with six independently submitted fields.

## 7. Commissioning test

Use a normal, non-admin account first. Complete this checklist before inviting users:

- [ ] Password sign-in works before changing the binding.
- [ ] The target realm's **Test connection** email arrives.
- [ ] A known enabled user receives a six-digit code.
- [ ] Typing, deleting, pasting all six digits, and mobile autofill work.
- [ ] A valid code completes the OIDC callback into Case Law Explorer.
- [ ] Resend delivers a new message; use only the most recent code.
- [ ] A wrong code is rejected without exposing account information.
- [ ] An unknown address creates no user and sends no message.
- [ ] OTP expires with the ten-minute login action.
- [ ] Magic link completes once and cannot be reused.
- [ ] Existing roles still allow/deny the same product areas.
- [ ] SSO carries the session into another Case Law service.
- [ ] API-key and service-account access remain unchanged.
- [ ] SMTP delivery, bounce and complaint telemetry is visible to operators.
- [ ] No code, action token, access token or refresh token appears in logs.
- [ ] Password rollback is tested with an account that has a password credential.

## 8. Rollback

In **Authentication → Bindings**, set **Browser flow** back to `browser` and save.
This restores username/email-and-password login. Do not delete the unbound
passwordless flow or its provider configuration during an incident; an unbound flow
is harmless and preserving it makes investigation easier.

Then set:

```env
CASELAW_PASSWORDLESS_AUTO_APPLY=false
```

Redeploy if automatic apply had been enabled, otherwise the next restart would bind
passwordless again. Existing SSO sessions may remain valid until logout or expiry.
Only revoke realm sessions when the incident requires signing everyone out.

The repository's realm JSON must continue to use `"browserFlow": "browser"` as its
portable default. Keep the production opt-in in deployment configuration rather
than committing a passwordless live-realm export over that baseline.

Users created without a password cannot use the default password flow. Assign a
temporary password/required action through the approved account-recovery process
before rollback, or keep a tested administrator break-glass account.

## 9. Troubleshooting

### The OTP page appears, but no email arrives

1. Confirm the address belongs to an existing enabled user in this realm.
2. Run **Realm settings → Email → Test connection** in this same realm.
3. Re-enter the SMTP password; a copied masked value is not a usable secret.
4. Inspect relay accepted, delivered, deferred and bounced events.
5. Check spam, quarantine, From-domain authorization, SPF, DKIM and DMARC.
6. Request one new code and use only the newest message.

### The password form still appears

Check **Authentication → Bindings → Browser flow**. Deploying the image alone is
non-disruptive and intentionally leaves the default `browser` binding in place.
Apply the optional flow explicitly or set the opt-in environment flag.

### Keycloak reports an unknown authenticator

The flow was bound before the provider image was deployed. Restore `browser`, deploy
the image, verify `ext-email-otp` and `ext-magic-form` appear in startup/provider
information, then apply again.

### OTP succeeds but the product rejects the callback

Authentication worked; inspect the application's exact redirect URI, state/PKCE
transaction cookie, and OIDC client ID. Product authorization failures are separate:
check roles and `caselaw-access` policy rather than weakening authentication.

### A magic link is expired before the user opens it

Mail-security scanners can consume single-use links. Check gateway logs and use OTP
while adjusting scanner policy.

For the estate architecture, threat boundaries and expanded production checks, read
[PASSWORDLESS_ROLLOUT.md](PASSWORDLESS_ROLLOUT.md).
