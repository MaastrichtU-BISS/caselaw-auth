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

If we decide to vendor the jar for supply-chain review, place the reviewed jar
here and adjust the Dockerfile to `COPY providers/<file>.jar
/opt/keycloak/providers/`.
