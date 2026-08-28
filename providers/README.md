# Providers

The Dockerfile downloads the Phase Two `keycloak-magic-link` provider from
Maven Central using the pinned `MAGIC_LINK_VERSION` build argument. That one
artifact provides both executions used by the realm:

- `ext-email-otp` — a six-digit email code;
- `ext-magic-form` — an emailed action-token link.

The realm disables account creation for both. Its magic links are single-use
with a 10-minute lifespan, and the realm login-action timeout gives OTP
sessions the same 10-minute bound. See
[`docs/PASSWORDLESS_ROLLOUT.md`](../docs/PASSWORDLESS_ROLLOUT.md) before
upgrading either the provider or Keycloak.

The final image also contains a small static configurator. On startup it waits
for Keycloak, validates the provider IDs, and reconciles the passwordless flow
for an existing realm. Set `CASELAW_PASSWORDLESS_AUTO_APPLY=false` to disable
that behavior; a failed reconciliation is logged and does not stop Keycloak.

If we decide to vendor the jar for supply-chain review, place the reviewed jar
here and adjust the Dockerfile to `COPY providers/<file>.jar
/opt/keycloak/providers/`.
