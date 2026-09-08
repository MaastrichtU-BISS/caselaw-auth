# Authentication rollout status

Last verified: **8 September 2026**. This page records deployment state; the
integration guides describe configuration contracts, not proof of deployment.
Update this page and the affected handoff when a rollout completes. A merged
documentation change, published npm package or configured callback is not by
itself evidence that an application has been deployed or tested end to end.

## Available now versus pending

| Component | Verified state | What to do |
|---|---|---|
| Shared Keycloak | Project-host routing, both branded login themes/favicons, responsive footer and OTP-only flow are deployed | Use the existing service; no second Keycloak instance is needed |
| Realm installer | `caselaw-auth@0.6.4` is published | Run it only to enable/upgrade the selected realm's OTP flow; never as a prerequisite for every app deployment |
| `caselaw` realm | Email-only OTP enabled on the shared issuer | Connect each product's own OIDC client; do not reinstall the realm flow |
| `digimach` realm | Email-only OTP enabled; existing users and localhost callbacks retained; sender `no-reply@digimach.eu` unchanged | Use the [DigiMach handoff](DIGIMACH_HANDOFF.md) |
| DigiMach custom domain | Coolify route prepared; public DNS, trusted TLS and coordinated issuer/application cutover remain pending | Keep `https://auth.caselawexplorer.tech/realms/digimach` until the cutover is agreed |
| Explorer frontend | Coolify stabilization remains on `demo-app.caselawexplorer.tech`; `app.caselawexplorer.tech` remains on Vercel | Do not change public-app DNS as part of an auth-domain change |
| Access per-project issuer support | Implementation is pending release/deployment; publishing its preview guide does not enable it | Do not assume the **Project authentication** card or project-auth API exists on the deployed console |
| Coolify frontend/runtime issuer mapping and derived workbench account URL | Implementation remains in [caselaw-coolify PR #18](https://github.com/MaastrichtU-BISS/caselaw-coolify/pull/18), not deployed | Do not use its new variable behavior until the operator confirms the implementation is deployed |

Username/email and password remain the **default for a newly imported realm**.
OTP is an explicit opt-in, already applied to the two live realms above. The
disabled magic-link execution/provider name may remain visible to administrators
for compatibility; users are not offered magic-link sign-in.

## Three separate integration responsibilities

1. **Keycloak proves identity.** The operator installs providers once per server;
   the realm administrator configures SMTP and optionally runs the OTP installer
   once per realm. Realm/client theme selection also chooses the login favicon.
2. **The application handles OIDC and its own session.** Use Authorization Code
   with PKCE, exact callback/logout allowlists, and the canonical realm issuer.
   With a backend, prefer server-held sessions and keep secrets server-side. A
   static SPA needs a public client. Neither path implements or validates OTP.
3. **APIs enforce authorization.** Validate access-token issuer/audience and apply
   the product's permissions. Access manages plans, keys and quotas; its console
   login is distinct from pending per-project API trust. A foreign-realm token
   must not be assumed to work with the currently deployed Access validator.

Basic DigiMach Keycloak login does not depend on the pending Access feature or
the Case Law Coolify app bundle. If DigiMach needs Access-protected APIs, coordinate
that additional rollout and audience configuration separately with BISS.

## Evidence and remaining acceptance

The shared service's deployment, realm configuration and existing discovery were
checked. Local/CI tests cover OTP registration, legacy-flow migration, disabled
magic-link selection, two project origins/themes, token exchange, refresh and
cleanup safety. Short-screen layout and served favicons were checked separately.

These checks do **not** prove DigiMach's future public DNS/TLS, production callback,
mailbox receipt, application sessions or API permissions. Those require the real
application acceptance test in [DIGIMACH_HANDOFF.md](DIGIMACH_HANDOFF.md). Keep
signature, issuer and audience validation enabled during that test.

## Where to start

- [OTP_SETUP.md](OTP_SETUP.md): enable OTP in a realm, including the no-clone CLI.
- [SERVER_SIDE_AUTH.md](SERVER_SIDE_AUTH.md) / [CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md): implement server-held / browser-held application sessions.
- [PROJECT_AUTH_DOMAINS.md](PROJECT_AUTH_DOMAINS.md): DNS, proxy, hostname defaults and coordinated issuer migration.
- [Access implementation-preview guide](https://github.com/MaastrichtU-BISS/caselaw-access/blob/main/docs/PROJECT_AUTH.md): pending project API trust and its release gate.
- [Coolify configuration guide](https://github.com/MaastrichtU-BISS/caselaw-coolify/blob/main/docs/PROJECT_AUTH_DOMAINS.md): version-gated deployment variables and the `demo-app` boundary.
