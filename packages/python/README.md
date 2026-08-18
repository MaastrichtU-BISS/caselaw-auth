# caselaw-auth-server

Server-side OIDC for Python products, interchangeable with the
[`caselaw-auth`](https://www.npmjs.com/package/caselaw-auth) npm package's
`/server` entry point.

A session cookie sealed by either implementation unseals in the other, byte for
byte. Both are written against `packages/contract/contract.json`, and both load
`packages/contract/conformance/cases.json` at test time — which is what keeps
them from drifting.

```bash
pip install caselaw-auth-server
```

## Why

`caselaw-auth/server` is TypeScript, and half this estate is not: caselaw-access
is FastAPI and citations-api is a Python HTTP server. Without a Python
implementation, those two would have stayed on browser-side sessions purely
because of the language their backend happens to be written in — with the
refresh token in `localStorage`, where page script can read it.

## Usage

```python
from caselaw_auth_server import create_server_auth, create_pkce_pair, random_token

auth = create_server_auth(
    issuer=os.environ["AUTH_ISSUER"],              # .../realms/caselaw
    client_id=os.environ["AUTH_CLIENT_ID"],
    redirect_uri=os.environ["AUTH_REDIRECT_URI"],
    session_secret=os.environ["AUTH_SESSION_SECRET"],
    client_secret=os.environ.get("AUTH_CLIENT_SECRET"),   # confidential clients
)
```

Start a sign-in:

```python
verifier, challenge = create_pkce_pair()
state = random_token()
# state and verifier must survive the round trip and stay unreadable by page
# script — a short httpOnly cookie, not anything the browser can see.
url = auth.authorization_url(state=state, code_challenge=challenge)
```

Complete it:

```python
tokens = auth.exchange_code(code=code, code_verifier=verifier)
claims = auth.verify_token(tokens["access_token"])
session = auth.session_from_claims(claims, id_token=tokens.get("id_token"))
cookie = auth.seal_session(session)
```

Read it on any request — an HMAC check, no network call:

```python
session = auth.unseal_session(request.cookies.get("caselaw_session"))
if not session or "admin" not in session["roles"]:
    raise Forbidden()
```

End it. `id_token_hint` is what makes this a real single sign-out:

```python
auth.end_session_url(id_token=session.get("idToken"), return_to=site)
```

## Mapping to the TypeScript package

Method names are idiomatic per language. **Session keys are camelCase in both**,
because they are wire format rather than API surface: renaming them per language
would break the property the whole contract exists to guarantee.

| TypeScript | Python |
|---|---|
| `createServerAuth(config)` | `create_server_auth(...)` |
| `authorizationUrl(options)` | `authorization_url(...)` |
| `exchangeCode(options)` | `exchange_code(...)` |
| `verifyToken(token, options)` | `verify_token(token, ...)` |
| `rolesFromClaims(claims)` | `roles_from_claims(claims)` |
| `sessionFromClaims(claims, options)` | `session_from_claims(claims, ...)` |
| `sealSession(session, name)` | `seal_session(session, name)` |
| `unsealSession(value)` | `unseal_session(value)` |
| `cookieOptions(maxAge, options)` | `cookie_options(max_age, ...)` |
| `endSessionUrl(options)` | `end_session_url(...)` |
| `createPkcePair()` | `create_pkce_pair()` |

Errors are typed here rather than string-matched: `InvalidToken`,
`AuthBackendUnavailable` and `SessionTooLarge`, all under `AuthError`. The split
between the first two is deliberate — collapsing them sends users to
re-authenticate during an outage, which cannot help and doubles the load on the
thing already failing.

## Behaviour worth knowing

- **`session_from_claims` does not keep the access token.** Where one is
  genuinely needed, put it in a cookie of its own; a token in a cookie leaks
  with the cookie.
- **The session carries its own TTL**, not the token's few minutes.
- **`seal_session` raises above 4096 bytes** rather than returning a cookie the
  browser will silently discard.
- **`verify_token` does not check `aud` by default.** Keycloak puts `account`
  there for a public client's access token and names the client in `azp`.
- **JWKS is cached and retried once**; a token that is itself invalid is never
  retried.

## Tests

```bash
pip install -e ".[dev]"
pytest
```

The suite loads the shared conformance cases by relative path. Running it from a
checkout of this repository is therefore required — the cases are not vendored
into the package.

## Related

- [caselaw-auth](https://github.com/MaastrichtU-BISS/caselaw-auth) — the realm, themes, and both implementations
- [docs/SERVER_SIDE_AUTH.md](https://github.com/MaastrichtU-BISS/caselaw-auth/blob/main/docs/SERVER_SIDE_AUTH.md) — the full walkthrough
