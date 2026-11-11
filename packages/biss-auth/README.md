# BISS Auth

Shared BISS OIDC authentication for Case Law Explorer, DigiMach, LawNotation,
Baigle, Bizzy and other projects. This package re-exports the maintained
`caselaw-auth` implementation at an exact tested version.

```sh
npm install biss-auth
```

Replace imports from `caselaw-auth` with `biss-auth`, retaining subpaths:
`/client`, `/server`, `/svelte`, `/vue` and `/vue/style.css`. The root API,
TypeScript declarations, CommonJS and ESM are supported. The CLI is
`npx biss-auth --help`.

Keep your issuer, client ID, session secret, cookies and browser storage settings
unchanged. The existing packages remain available. See
[the migration guide](../../docs/BISS_AUTH_MIGRATION.md) for version upgrades,
operator release steps and deployment verification.
