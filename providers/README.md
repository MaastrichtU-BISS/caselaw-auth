# Providers

The Dockerfile downloads the Phase Two `keycloak-magic-link` provider from
Maven Central using the pinned `MAGIC_LINK_VERSION` build argument. That one
artifact provides both executions used by the realm:

- `ext-email-otp` — a six-digit email code;
- `ext-magic-form` — an emailed action-token link.

The realm also uses this repository's `caselaw-email-identity` authenticator before
those methods. It renders the email field and resolves or creates the email-only user
without treating a missing user as an error. The upstream OTP provider's force-create
option cannot do this when Keycloak's built-in username form rejects the address
first.

The email-identity step creates an enabled, unverified user when a new address is
submitted; a successful downstream challenge marks the address verified and
authenticates the user. No name or password credential is requested. The realm
installer also makes Keycloak's built-in first- and last-name profile attributes
optional; otherwise the default Verify Profile action can request them after OTP.
Magic links are single-use with a 10-minute lifespan, and the realm login-action
timeout gives OTP sessions the same 10-minute bound. See
[`docs/PASSWORDLESS_ROLLOUT.md`](../docs/PASSWORDLESS_ROLLOUT.md) before
upgrading either provider or Keycloak.

The final image also contains a small static configurator. On startup it waits
for Keycloak, validates the provider IDs, and reconciles the passwordless flow
for an existing realm. Set `CASELAW_PASSWORDLESS_AUTO_APPLY=false` to disable
that behavior; a failed reconciliation is logged and does not stop Keycloak.

If we decide to vendor the jar for supply-chain review, place the reviewed jar
here and adjust the Dockerfile to `COPY providers/<file>.jar
/opt/keycloak/providers/`.
