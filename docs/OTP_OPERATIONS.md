# Operate email OTP

Use this runbook after a realm has been commissioned with
[OTP_SETUP.md](OTP_SETUP.md). It covers routine checks, delivery monitoring,
abandoned-account retention, upgrades, incidents, and rollback. It is not a second
setup guide.

[Authentication rollout status](AUTH_ROLLOUT_STATUS.md) records which realms and
downstream features are deployed. Keycloak's **Test connection** sends to the
signed-in administrator's email address; configure that address before using it.
A bootstrap admin without an email cannot use that test to establish SMTP delivery.

## Supported production combination

| Component | Tested version |
|---|---|
| Keycloak | `26.7.0` |
| Phase Two `keycloak-magic-link` provider | `0.75` |
| Case Law email-identity provider | `1.1.0`, built against Keycloak `26.7.0` |
| Realm administration CLI | `caselaw-auth@0.6.4` |

The providers implement Keycloak internal SPIs. Pin both image arguments and treat
any Keycloak or provider update as an authentication migration. Do not deploy an
untested floating tag.

## Routine realm check

Run this read-only check after a deployment and at least daily from an operator
machine. It does not alter the realm and does not print the password.

```bash
export KEYCLOAK_URL=https://auth.caselawexplorer.tech
export KEYCLOAK_REALM=caselaw
export KEYCLOAK_ADMIN_REALM=master
export KEYCLOAK_ADMIN=admin
export KEYCLOAK_ADMIN_PASSWORD='<read from the secret manager>'
export CASELAW_PASSWORDLESS_ESTATE_MODE=true

npx --yes caselaw-auth@0.6.4 check-passwordless
unset KEYCLOAK_ADMIN_PASSWORD
```

For another realm, change `KEYCLOAK_REALM` and normally set estate mode to `false`.
The command verifies installed providers, the exact flow and binding, the login
timeout, disabled registration form, optional name attributes, SMTP host/from, and
the Case Law clients when estate mode is enabled. It proves configuration, not that
the destination mailbox received a message.

## SMTP delivery monitor

An SMTP “test connection” and the read-only command above are necessary but not an
end-to-end delivery check. Configure a synthetic monitor with a dedicated mailbox
that performs the real browser journey:

1. Every five minutes, open the application's `/auth/login` route with a fresh cookie
   jar and request a code for the monitoring address.
2. Require the OTP page to appear. A server error here detects rejection by the SMTP
   relay.
3. Poll that mailbox and require a new message within two minutes. Record latency,
   but never the message body, code, link, or action-token URL.
4. Extract the newest six-digit code, submit it, and require an application callback
   with a successful session.
5. Alert after two consecutive failures and route relay rejection, delayed delivery,
   and callback failure as separate symptoms.

Use an existing, non-admin monitoring account so a probe never creates privileged
access. Exclude the account from human workflows and keep its mailbox credentials in
the monitoring platform's secret store. The repository's Docker journey implements
the same contract against Mailpit and runs in CI; production monitoring must use the
real relay and mailbox.

Useful service-level targets are: 99.9% successful OTP delivery and callback over a
rolling 30 days, p95 delivery below 60 seconds, and no unreviewed alert longer than
15 minutes. Adapt these to the relay's actual SLA.

## Remove abandoned unverified accounts

Submitting an unknown email creates an enabled but unverified account before the
code is proven. The account has no session, role, or password, but abandoned records
should not accumulate indefinitely.

The cleanup command deliberately selects only users that are all of the following:

- older than the retention threshold;
- marked by the server as created by the self-service email-first flow;
- unverified;
- username equal to email;
- without first name, last name, required actions, federation, or service-account
  ownership;
- without any credential.

It is a dry run by default:

```bash
npx --yes caselaw-auth@0.6.4 cleanup-unverified-users --max-age-days 7
```

Review every listed address. Then repeat the identical command with `--execute`:

```bash
npx --yes caselaw-auth@0.6.4 cleanup-unverified-users --max-age-days 7 --execute
```

Use the same `KEYCLOAK_*` environment variables as the routine check. Start with a
weekly dry run. After the retention period has been approved, schedule the executing
form and retain only its summary and user IDs in restricted operator logs. The
command refuses a negative threshold and never deletes a user with a credential or
name, but the operator remains responsible for reviewing the first run in each realm.
Pending users created by provider versions before `1.1.0` have no provenance marker
and are intentionally omitted; review those legacy records manually rather than
weakening the selector.

## Abuse and delivery signals

Alert on sudden changes in:

- OTP sends, resend requests, relay rejections, bounces, and delivery latency;
- failed-code events and expired login actions;
- newly created versus newly verified users;
- count and oldest age of unverified email-only users;
- authorization requests rejected at the edge rate limit.

Apply rate limiting at the edge to the public authorization and form-action routes.
Keycloak brute-force protection limits wrong codes but does not stop an attacker from
starting many new sessions and generating email.

## Upgrade gate

Before changing either pinned version:

1. Create an upgrade branch and change the Keycloak and provider versions together
   only when their compatibility is known.
2. Run `npm ci && npm test && npm run typecheck && npm run build`.
3. Run `npm run test:e2e`. It builds the image and tests a fresh realm, the legacy
   alias migration, real SMTP delivery through Mailpit, passwordless account shape,
   OIDC callback/token exchange, the read-only health check, and cleanup safety.
4. Deploy to a non-production realm and run the routine realm check.
5. Complete a real mailbox journey through every distinct callback surface.
6. Review provider and Keycloak release notes, then promote the exact tested image.

CI runs this gate on pull requests, pushes to `main`, and npm publication. A failed
Docker journey blocks package publication.

## Incident and rollback

If delivery is unavailable, keep an administrator break-glass session and rebind
**Authentication → Bindings → Browser flow** to the built-in `browser` flow. Set
`CASELAW_PASSWORDLESS_AUTO_APPLY=false` before restarting, or automatic reconciliation
will bind OTP again. Users created by OTP have no passwords; communicate an
administrator-assisted recovery route before rollback. Do not delete the unbound
flow during an incident.

For symptom-by-symptom diagnosis, see
[OTP_SETUP.md#troubleshooting-by-symptom](OTP_SETUP.md#troubleshooting-by-symptom).
