# biss-auth-server

Shared BISS server-side OIDC authentication using the maintained
`caselaw-auth-server` implementation at an exact tested version.

```sh
pip install biss-auth-server
```

```python
from biss_auth_server import create_server_auth, create_pkce_pair
```

The public API is identical to `caselaw_auth_server`, including exception class
identities and the `biss_auth_server.server` module. Keep the issuer, client ID,
session secret and cookie settings unchanged. Existing packages stay available.
See the repository's docs/BISS_AUTH_MIGRATION.md for the release and migration plan.
