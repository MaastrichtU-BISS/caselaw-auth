# Live custom-domain acceptance test

This is a test of the existing shared Keycloak deployment, not a second Keycloak
instance. Never change a live project's issuer just to test domain routing.

## Isolated test configuration

| Component | Test value |
|---|---|
| Authentication origin | `https://auth-test.caselawexplorer.tech` |
| Realm | `domain-canary` |
| Issuer | `https://auth-test.caselawexplorer.tech/realms/domain-canary` |
| Public client | `domain-canary-browser` |
| API audience mapper | `domain-canary-api` (access tokens only) |
| Exact application callback | `http://127.0.0.1:8097/auth/callback` |
| Exact post-logout redirect | `http://127.0.0.1:8097/` |

The callback is a temporary **local test application**. Keycloak, its SMTP service,
DNS, proxy and TLS are real deployed services. This test alone does not certify
every deployed application or the Access console release.

1. Route the test auth hostname to the existing Keycloak service's internal port
   8080 in Coolify, preserving the shared hostname. Apply routing and verify TLS.
2. Create the isolated realm with its `frontendUrl` set to the test **origin**.
   Create the public OIDC client above, require PKCE S256 and disable direct grants.
3. Configure SMTP in **this realm**, then run the normal passwordless installer
   with `KEYCLOAK_REALM=domain-canary` and
   `CASELAW_PASSWORDLESS_ESTATE_MODE=false`. Never change the production container's
   automatic reconciliation target to this test realm.
4. Configure the audience mapper and exact callback/logout URLs above.

### SMTP: use the credential's authorized sender domain

The authentication hostname and the email **From** domain are independent. A
login at `auth-test.caselawexplorer.tech` can send from an existing verified
Mailtrap sender domain. It does not require a new email-sending domain.

Keycloak masks SMTP passwords in admin API responses. Copying another realm's
settings does **not** copy its usable password. Enter the credential directly in
**Realm settings → Email**, and match **From** to a verified domain that the token
is allowed to send from. Do not paste SMTP credentials into tickets or test output.

For Mailtrap transactional sending: host `live.smtp.mailtrap.io`, port `587`,
username `api`, authentication enabled, STARTTLS enabled, implicit SSL disabled.
Use the SMTP password/token shown for the intended sending domain, not Sandbox
credentials. A `550 5.7.1 Sending from domain … is not allowed` error is a sender
authorization failure; changing Keycloak's auth domain or Coolify host variables
does not fix it. See [Mailtrap SMTP setup](https://docs.mailtrap.io/email-api-smtp/setup/smtp-integration)
and [token permissions](https://docs.mailtrap.io/email-api-smtp/setup/api-tokens).

## Run the real browser journey

From the auth repository:

```sh
npm ci
npm run build
node scripts/check-realm-domain.mjs https://auth-test.caselawexplorer.tech/realms/domain-canary
node test/e2e/live-domain-canary.mjs
```

The fixture binds only to `127.0.0.1:8097`, rejects other Host headers, keeps
transactions/tokens in memory and never logs credentials. It uses the actual
`caselaw-auth/server` package. Do not deploy this fixture as an application.

1. Open `http://127.0.0.1:8097/auth/login` in a browser on the same computer.
2. Use an authorized test mailbox. Confirm email-only registration, no name or
   password fields, receipt of the OTP, and successful code entry.
3. Confirm the callback shows **You’re signed in** and passed token checks.
   `/report` lists completed checks without tokens or email addresses.
4. Check browser network requests: login, OTP and theme resources must stay on
   the test auth origin. The callback deliberately returns to the local app.
5. Sign out, then sign in again. Confirm the email prompt returns, rather than
   silently reusing the previous SSO session.
6. Confirm there is no **Use another sign-in method** link and the magic-link
   execution is disabled. Email sign-in is OTP-only.
7. Independently check the shared `caselaw` and `digimach` discovery URLs and
   existing application redirects after the routing change.

The fixture automatically checks code exchange with PKCE, state, ID-token nonce,
token signatures, issuer, API audience, rejection of a wrong audience and a
tampered token, and refresh through the custom origin. Mail delivery, UI behavior,
logout, OTP-only method availability and deployed API authorization require their
separate acceptance observations; do not claim them from `/report` alone.

## Cleanup and rollout

Stop the local fixture to discard its in-memory sessions and tokens. When the
canary is no longer needed, remove **only** the `domain-canary` realm and its test
hostname route. This deletes test users and clients in that realm; keep the shared
hostname and all production realms. Recheck existing discovery after routing
changes. Alternatively retain the isolated canary explicitly for future release
checks, with a named owner and limited test data.

Once the canary passes, follow [the project-domain rollout](PROJECT_AUTH_DOMAINS.md)
for the real project's DNS, TLS, realm issuer and coordinated application/API
configuration. DigiMach's production issuer must stay unchanged until its DNS
owner has configured `auth.digimach.eu` and the application owner is ready.

## Acceptance evidence — 8 September 2026

Observed against the shared deployed Keycloak and the local package fixture:

- Test hostname has trusted HTTPS; canonical discovery, PKCE support, signing
  keys and account page pass. Forged forwarding headers do not change its issuer.
- Email and OTP pages load all observed resources from the test auth origin.
- A real mailbox completed OTP registration. Exactly one verified user exists,
  with no first/last name and no password or other stored credential.
- The package callback passed PKCE, state, nonce, signature, issuer and API
  audience checks. Wrong-audience and tampered-token checks fail as expected.
- Token refresh works on the custom origin. Repeat sign-in reuses SSO, and
  logout clears the local session and returns to an email prompt on next login.
- Existing Case Law and DigiMach discovery checks still pass on the shared host.

Magic-link testing was discontinued: the supported email flow is now OTP-only.
Still pending: testing the Access per-project issuer release plus connected
applications after deployment.
This is **not** evidence that those pending deployments are production-ready.
