# BISS Auth migration

BISS Auth is the shared authentication infrastructure for Case Law Explorer,
DigiMach, LawNotation / Baigle, Bizzy and other BISS projects.

## Release status (12 November 2026)

The new distributions are prepared in this change, **not yet published**:

| Ecosystem | New distribution | Import / command | Implementation |
|---|---|---|---|
| npm | `biss-auth@0.6.5` | `biss-auth`, `biss-auth/server`, `/client`, `/svelte`, `/vue`, `/vue/style.css`; CLI `biss-auth` | exact dependency `caselaw-auth@0.6.5` |
| Python | `biss-auth-server==0.3.0` | `biss_auth_server`, `biss_auth_server.server` | exact dependency `caselaw-auth-server==0.3.0` |

Both names use one implementation. Old packages remain available and maintained.
The existing Vue names such as `createCaselawAuth` and `CaselawAuthKey` stay valid.
The Python facade preserves exception class identity. No runtime authentication
configuration or session format is changed by installing these packages.

Do not advise consumers to install the new names until their registry artifacts
have been published and independently installed and verified.

## For application teams, after publication

JavaScript / TypeScript:

```sh
npm install biss-auth@0.6.5
```

Change package imports, preserving the symbols and subpaths:

```ts
import { createServerAuth } from 'biss-auth/server'
// Browser: import { createAuthClient } from 'biss-auth'
// Vue styles: import 'biss-auth/vue/style.css'
```

Python:

```sh
pip install biss-auth-server==0.3.0
```

```python
from biss_auth_server import create_server_auth, create_pkce_pair
```

Remove the old *direct* dependency when all application imports use the new name,
and commit the updated lockfile. The old implementation remains a transitive
dependency intentionally. Do not manually remove it from the installed tree.

Teams may upgrade to the current SDK during this migration. Source manifests
checked on 11 November show DigiMach at 0.6.3, Citations at ^0.4.0, Bizzy at ^0.6.5
and Access at caselaw-auth-server>=0.2.0. These are source versions, not deployed
version attestations. LawNotation's root manifest has no SDK dependency; confirm
its application's integration before making a package change. Also inventory
external/private consumers that GitHub search cannot find.

Keep issuer, client ID, client secret, session secret, redirect/logout URLs,
scopes, cookie options and custom storage keys unchanged. The historical defaults
`caselaw:auth` and `caselaw_session` deliberately retain their names. Do not clear
browser storage or reinstall the realm's OTP flow during an SDK migration.

For each consumer, verify an existing session across deployment, a sign-in begun
before deployment and completed afterwards, fresh sign-in/callback, refresh and
logout. Test the application's authorization behavior as well as authentication.
The source's newer behavior must be tested when upgrading from older releases.
Rollback is the previous application build/lockfile with the same secrets and
configuration; it requires no Keycloak or database rollback.

## Operator: publication and repository rename

1. Merge the package change after CI succeeds. This does not authorize a runtime
   redeployment: use the existing Keycloak instance and Postgres volume.
2. Publish the new npm package once with a maintainer account if needed to
   bootstrap its trusted publisher. Configure `biss-auth` to trust the repository,
   workflow `publish-biss.yml`, GitHub environment `npm`. For Python create a
   pending publisher for `biss-auth-server`, workflow `publish-biss.yml`, environment
   `pypi`. Both publishers need owner `MaastrichtU-BISS` and the repository's
   **current** name. Do not change the legacy workflow filenames or environments.
3. Use `biss-npm-v0.6.5` and `biss-python-v0.3.0` tags for the respective packages.
   `publish-biss.yml` also supports an explicit package selection and defaults to
   dry-run validation on manual dispatch. Original `v*` and `python-v*` releases
   still publish the legacy packages through their original workflows.
4. Install registry tarball/wheel in fresh environments and repeat the package
   compatibility and consumer smoke checks before announcing availability.
5. Freeze releases briefly. A repository admin renames `caselaw-auth` to
   `biss-auth`. Update trusted publisher repository settings for all four package
   names, keeping workflow filenames and environments aligned. Update package
   repository/homepage/issue metadata and documentation links afterwards. Do not
   preconfigure links to a repository that does not yet exist.
6. GitHub redirects old web and clone URLs. Never recreate `caselaw-auth` under
   either prior owner: that can remove redirects used by consumers. Calls to an
   Action hosted by a renamed repository do not redirect; check reusable workflow
   and Action consumers separately.
7. Update Coolify Git Source to `MaastrichtU-BISS/biss-auth`, retaining the current
   GitHub App, branch `main`, application UUID, Compose project, domains, server
   and persistent storage. Verify repository access and webhook delivery. A save
   must not be followed by Redeploy merely for the rename. Verify old and new
   clone access and release dry runs after changing publisher configuration.

Publisher administration requires registry sign-in. The connected GitHub account
currently reports push access but no repository-admin access, and the browser's
repository Options page confirms that restriction. An organization owner must
perform the rename or grant the needed access.

The Coolify display names were updated to project **BISS Auth**, application
**biss-auth**, without requesting a deployment. Its production application UUID is
`meegwjxxroezicczlljnof1q` on gooseberry, project UUID
`nkssssk0wk4scs4cgwg84o4o`, source `davidwickerhf/caselaw-auth`, branch `main`.
That historical source URL redirects to `MaastrichtU-BISS/caselaw-auth`; it is not
a separate fork. Keep its source unchanged until the repository rename is ready.

## Production endpoints: preserve exactly

Discovery checks on 11 November 2026 returned these issuers (rechecked after the
Coolify display-name changes on 12 November):

- Case Law Explorer: `https://auth.caselawexplorer.tech/realms/caselaw`
- DigiMach: `https://auth.biss-institute.com/realms/digimach`
- Bizzy: `https://auth.usebizzy.eu/realms/bizzy`
- LawNotation / Baigle: `https://auth.lawnotation.org/realms/lawnotation`

No DNS, Keycloak hostname, realm Frontend URL, signing key, user, SMTP, theme,
client, callback allowlist or database-volume change belongs to this rename.
Discovery success does not replace end-to-end production login acceptance.

## Validation

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:packages
npm audit --omit=dev
python -m pip install build pytest ./packages/python ./packages/python-biss
python -m pytest -q packages/python/tests packages/python-biss/tests
node packages/contract/conformance/interop.mjs "$(which python)"
python -m build packages/python-biss
npm run test:e2e
```

The packaging check installs real npm tarballs in an isolated directory and tests
ESM/CommonJS exports and identity, declarations, CSS, CLI dispatch and cookie
interchangeability. Python tests check public API/exception identity and session
interchangeability. The cross-language suite checks signatures and identical
session bytes. Existing OTP end-to-end tests use disposable local containers.

## References

- [Repository rename and redirect rules](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/)
- [Project domains](PROJECT_AUTH_DOMAINS.md)
- [Shared session contract](../packages/contract/contract.json)
