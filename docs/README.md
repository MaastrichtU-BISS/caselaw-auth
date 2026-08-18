# Documentation

Reference and integration guides for Case Law Auth: the shared Keycloak realm,
its theme, and the `caselaw-auth` npm package.

## Guides

| Document | Audience | Covers |
|---|---|---|
| [SERVER_SIDE_AUTH.md](SERVER_SIDE_AUTH.md) | Engineers integrating a product that has a backend | `caselaw-auth/server`, session cookies, token verification, DiscourseConnect |
| [CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md) | Engineers integrating a static SPA | `caselaw-auth/client`, Vue and Svelte adapters, Keycloak client setup |
| [REALM_SETUP.md](REALM_SETUP.md) | Administrators configuring a realm | Realm settings, roles, clients, identity providers, hardening |
| [AUTH_FRONTEND_PACKAGE.md](AUTH_FRONTEND_PACKAGE.md) | Engineers | Per-framework environment variable plumbing |

## Choosing an integration path

Both paths use the same realm, the same package and the same Keycloak client
model. They differ only in where the session is held.

| | `caselaw-auth/server` | `caselaw-auth/client` |
|---|---|---|
| **Use when** | The product has a backend | The product is a static SPA |
| **Session location** | httpOnly cookie | `localStorage` |
| **Readable by page script** | No | Yes, including the refresh token |
| **Holds a shared secret** | Supported | Not possible |
| **Guide** | [SERVER_SIDE_AUTH.md](SERVER_SIDE_AUTH.md) | [CONNECTING_PROJECTS.md](CONNECTING_PROJECTS.md) |

> **Recommendation.** Where a backend exists, use the server path. The browser
> client stores the refresh token where page script can read it, so a single
> cross-site scripting flaw yields a long-lived credential. This is the
> backend-for-frontend pattern described in the
> [OAuth 2.0 Security Best Current Practice][bcp] and recommended by Keycloak's
> own application-security guidance.

Every product in this estate has a backend. The browser client remains supported
and correct for SPAs that do not.

[bcp]: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics

## Related repositories

- [caselaw-access](https://github.com/MaastrichtU-BISS/caselaw-access) — plans, API keys, quotas
- [caselaw-ui](https://github.com/MaastrichtU-BISS/caselaw-ui) — shared interface components
