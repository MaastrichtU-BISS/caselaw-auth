# Providers

The Dockerfile downloads the Phase Two `keycloak-magic-link` provider from
Maven Central using the pinned `MAGIC_LINK_VERSION` build argument.

If we decide to vendor the jar for supply-chain review, place the reviewed jar
here and adjust the Dockerfile to `COPY providers/<file>.jar
/opt/keycloak/providers/`.

