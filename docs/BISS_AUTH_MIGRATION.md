# BISS Auth migration

BISS Auth is the shared authentication infrastructure for Case Law Explorer,
DigiMach, LawNotation / Baigle, Bizzy and other BISS projects.

## Implementation ownership (12 November 2026)

The published standalone releases reverse the initial compatibility bridge:

| Package | Version | Ownership |
|---|---|---|
| npm `biss-auth` | 0.6.6 | Standalone implementation; no legacy dependency |
| npm `caselaw-auth` | 0.6.6 | Exact dependency on `biss-auth@0.6.6` |
| PyPI `biss-auth-server` | 0.3.1 | Standalone implementation; no legacy dependency |
| PyPI `caselaw-auth-server` | 0.3.1 | Exact dependency on `biss-auth-server==0.3.1` |

All four versions are published and verified from registry artifacts in clean
environments. Canonical BISS packages were published and verified first, followed
by the legacy wrappers. Legacy release workflows enforce that order. There is no
circular dependency. Previous package versions are immutable and remain available.
Explorer can remain pinned to its deployed `biss-auth@0.6.5` during this transition.

The implementation moves without changing runtime behavior, cookies, wire formats,
public symbol names or exception identities. Legacy entry points and administration
commands forward to BISS Auth. Installing BISS alone does not install a legacy
package. No Keycloak deployment is needed.

## Legacy npm installation warning

All 17 currently published `caselaw-auth` versions, including 0.6.6, carry npm's
deprecation metadata. Fresh installs display:

> Renamed to biss-auth. Use biss-auth@0.6.6 or newer and update package imports.
> Keep your issuer, clients, session secrets and cookie settings unchanged.
> Existing versions remain available and supported for compatibility.

This is a registry installation notice; no runtime warning or authentication
behavior changes. Package versions remain installable. The initial
`biss-auth@0.6.5` bridge also pulls a deprecated legacy dependency, so upgrade it
to standalone `biss-auth@0.6.6` to remove that dependency and notice.

After future legacy npm releases, reapply the notice with `npm deprecate
'caselaw-auth@*' '<message above>'` and verify registry metadata and a clean
installation. npm may require a fresh maintainer authenticator code for this
metadata operation; trusted publishing of releases remains tokenless.

## Standalone release evidence

All releases point to commit `095bcb64ba05ba226db73296c22b64df6038e6ef`, whose
three CI jobs passed. The PR remains unmerged so the current Coolify main-branch
webhook cannot restart Keycloak. Production Explorer remains on `biss-auth@0.6.5`.

| Release | Registry | Trusted-publishing run |
|---|---|---|
| BISS npm 0.6.6 | [npm](https://www.npmjs.com/package/biss-auth/v/0.6.6) | [43132164373](https://github.com/MaastrichtU-BISS/caselaw-auth/actions/runs/43132164373) |
| BISS Python 0.3.1 | [PyPI](https://pypi.org/project/biss-auth-server/0.3.1/) | [43132164289](https://github.com/MaastrichtU-BISS/caselaw-auth/actions/runs/43132164289) |
| Legacy npm 0.6.6 | [npm](https://www.npmjs.com/package/caselaw-auth/v/0.6.6) | [43132740206](https://github.com/MaastrichtU-BISS/caselaw-auth/actions/runs/43132740206) |
| Legacy Python 0.3.1 | [PyPI](https://pypi.org/project/caselaw-auth-server/0.3.1/) | [43132437010](https://github.com/MaastrichtU-BISS/caselaw-auth/actions/runs/43132437010) |

Registry tarballs/wheels were checked against their published integrity hashes.
BISS-only installs contain no legacy package. Installing the new legacy wrappers
preserves ESM/CommonJS identity, Python API/exception identity, CLI dispatch,
TypeScript declarations, CSS and sessions. Previous npm 0.6.5 sessions work in
both directions; TypeScript/Python session bytes remain identical. Full disposable
Keycloak OTP, legacy flow upgrade, two-domain issuer/refresh/logout and cleanup
checks passed. No production realm or deployment was changed.

Exact registry artifacts are attached to the corresponding GitHub releases:
`biss-npm-v0.6.6`, `biss-python-v0.3.1`, `v0.6.6`, `python-v0.3.1`.

## Initial bridge releases (published)

Both `biss-auth@0.6.5` (npm) and `biss-auth-server==0.3.0` (PyPI) are published
and independently verified from their registry artifacts. Existing consumers may
switch to these package names when their application owners are ready.

The GitHub repository rename is deferred until an organization admin is available.
BISS package publication uses the current repository `MaastrichtU-BISS/caselaw-auth`
and does not depend on that rename.

| Release | Status | Evidence |
|---|---|---|
| Python 0.3.0 | Published via GitHub OIDC | [PyPI](https://pypi.org/project/biss-auth-server/0.3.0/), [release](https://github.com/MaastrichtU-BISS/caselaw-auth/releases/tag/biss-python-v0.3.0), [successful workflow](https://github.com/MaastrichtU-BISS/caselaw-auth/actions/runs/43117861118) |
| npm 0.6.5 | Published through maintainer bootstrap; GitHub trusted publisher validated | [npm](https://www.npmjs.com/package/biss-auth/v/0.6.5), [release](https://github.com/MaastrichtU-BISS/caselaw-auth/releases/tag/biss-npm-v0.6.5) |

The Python registry wheel was downloaded, checked against its registry SHA-256,
and installed in a clean environment using the published legacy dependency. Public
API identity and session interchange passed. The release tag points to tested
commit `0ccac7a6c3aa24937d87ecc2383583c857f1ed66`; it was published without merging
into `main` or redeploying Keycloak.

The npm tarball was checked against its registry SHA-1 and SHA-512 integrity,
installed in a clean environment, and tested for ESM/CommonJS API identity,
TypeScript declarations, Vue CSS, installed CLI dispatch and old/new session
interchange. Its registry SHA-1 is `cb763d3e7d70cb80c872163312d78532bf34cd88`.
The npm release tag points to `4f33de0a3bd829f82cdc01d8c5f4168b34d98242`.

The new npm trusted publisher is **Valid** for `MaastrichtU-BISS/caselaw-auth`,
`publish-biss.yml`, environment `npm`, with direct/staged publication permission.
The Python publisher uses that workflow and the `pypi` environment. No long-lived
registry tokens were added to GitHub.

The [npm automation validation run](https://github.com/MaastrichtU-BISS/caselaw-auth/actions/runs/43127803511)
passed its checks and authenticated through OIDC, then correctly refused to
publish over the maintainer's already published `0.6.5`. npm marked the publisher
Valid. That run's duplicate-version failure is not a failed package release;
future releases require a new package version and matching release tag.

Package names and compatibility mapping:

| Ecosystem | New distribution | Import / command | Implementation |
|---|---|---|---|
| npm | `biss-auth@0.6.5` | `biss-auth`, `biss-auth/server`, `/client`, `/svelte`, `/vue`, `/vue/style.css`; CLI `biss-auth` | exact dependency `caselaw-auth@0.6.5` |
| Python | `biss-auth-server==0.3.0` | `biss_auth_server`, `biss_auth_server.server` | exact dependency `caselaw-auth-server==0.3.0` |

Both names use one implementation. Old packages remain available and maintained.
The existing Vue names such as `createCaselawAuth` and `CaselawAuthKey` stay valid.
The Python facade preserves exception class identity. No runtime authentication
configuration or session format is changed by installing these packages.

The initial versions above have passed registry installation checks. Apply the
same publication and verification gate before recommending each future release.

## For application teams

JavaScript / TypeScript:

```sh
npm install biss-auth@0.6.6
```

Change package imports, preserving the symbols and subpaths:

```ts
import { createServerAuth } from 'biss-auth/server'
// Browser: import { createAuthClient } from 'biss-auth'
// Vue styles: import 'biss-auth/vue/style.css'
```

Python:

```sh
pip install biss-auth-server==0.3.1
```

```python
from biss_auth_server import create_server_auth, create_pkce_pair
```

Remove the old *direct* dependency when all application imports use the new name,
and commit the updated lockfile. The standalone versions above do not install the legacy package. Lockfiles that
still include it may have another dependency using the legacy name; retain that
entry until that dependency migrates.

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

1. Release only a commit that has passed CI. A release tag may point to the
   tested PR commit while `main` remains unchanged, avoiding its deployment
   webhook. Merging this package change should be coordinated with the operator
   because Coolify currently auto-deploys pushes to `main`. Keep the existing
   Keycloak instance and Postgres volume.
2. Publish the new npm package once with a maintainer account if needed to
   bootstrap its trusted publisher. Configure `biss-auth` to trust the repository,
   workflow `publish-biss.yml`, GitHub environment `npm`. For Python create a
   pending publisher for `biss-auth-server`, workflow `publish-biss.yml`, environment
   `pypi`. Both publishers need owner `MaastrichtU-BISS` and the repository's
   **current** name. Do not change the legacy workflow filenames or environments.
3. Use `biss-npm-v0.6.6` and `biss-python-v0.3.1` tags for standalone releases,
   followed by `v0.6.6` and `python-v0.3.1` for the legacy wrappers.
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

Publisher setup for both BISS packages is complete under the current repository
name. The connected GitHub account has push access but no repository-admin
access. Repository renaming is explicitly deferred until an organization owner
is available; this does not block SDK use or releases.

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
python -m build packages/python
python test/packaging/python-packages.py
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
