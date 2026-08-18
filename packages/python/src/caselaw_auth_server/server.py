"""Server-side OIDC for Python products, matching ``caselaw-auth/server``.

The two implementations are interchangeable rather than merely similar: a
session cookie sealed by either unseals in the other, byte for byte. Both are
written against ``packages/contract/contract.json`` and both load
``packages/contract/conformance/cases.json`` at test time, which is what stops
them drifting — a behaviour with no case there is a behaviour that can drift.

This exists because ``caselaw-auth/server`` is TypeScript, and half this estate
is not: caselaw-access is FastAPI and citations-api is a Python HTTP server.
Without it, those two would have stayed on browser-side sessions purely because
of the language their backend happens to be written in.

Idiomatic Python on the surface, identical on the wire. Method names are
snake_case; **session keys stay camelCase in both languages**, because they are
wire format rather than API surface.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping
from urllib.parse import urlencode

import httpx
import jwt
from jwt import InvalidTokenError, PyJWKClient, PyJWKClientError

__all__ = [
    "ServerAuth",
    "ServerAuthConfig",
    "AuthError",
    "InvalidToken",
    "AuthBackendUnavailable",
    "SessionTooLarge",
    "create_server_auth",
    "create_pkce_pair",
    "random_token",
    "COOKIE_BYTE_LIMIT",
]

#: Browsers cap one cookie at 4096 bytes and drop anything larger in silence.
COOKIE_BYTE_LIMIT = 4096

_DEFAULT_SCOPE = "openid profile email"
_DEFAULT_SESSION_TTL = 8 * 3600
_DEFAULT_JWKS_CACHE = 300
_ALGORITHMS = ["RS256", "RS384", "RS512", "ES256"]


class AuthError(Exception):
    """Base for every error this module raises."""


class InvalidToken(AuthError):
    """The token itself is wrong. Never worth retrying — it says the same thing twice."""


class AuthBackendUnavailable(AuthError):
    """The identity provider could not be reached, after one retry.

    Distinct from :class:`InvalidToken` on purpose. Collapsing the two sends
    users to re-authenticate during an outage, which cannot help and doubles the
    load on the thing that is already failing.
    """


class SessionTooLarge(AuthError):
    """The sealed cookie would exceed what a browser will keep."""


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def random_token(num_bytes: int = 32) -> str:
    """URL-safe random string, for ``state`` and PKCE verifiers."""
    return _b64url_encode(secrets.token_bytes(num_bytes))


def create_pkce_pair() -> tuple[str, str]:
    """``(verifier, challenge)``, with the challenge as base64url SHA-256.

    PKCE is not only for public clients. A confidential client that also sends a
    challenge is protected even if its secret leaks, and this realm's clients
    are configured to require S256, so a server flow without it is refused.
    """
    verifier = random_token(64)
    challenge = _b64url_encode(hashlib.sha256(verifier.encode("utf-8")).digest())
    return verifier, challenge


def _dumps(payload: Any) -> str:
    """JSON exactly as ``JSON.stringify`` produces it.

    Both arguments are load-bearing and pinned by the contract. Python's default
    separators insert spaces and its default ``ensure_ascii`` escapes non-ASCII
    to ``\\uXXXX``; JavaScript does neither. Left alone, the two implementations
    would seal the same session to different bytes, and the first person to
    notice would be whoever tried to hand a cookie from one service to another.
    """
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


@dataclass
class ServerAuthConfig:
    """See ``packages/contract/contract.json`` for the authoritative definitions."""

    issuer: str
    client_id: str
    redirect_uri: str
    session_secret: str
    #: Confidential clients only. Never reachable from a browser.
    client_secret: str | None = None
    scope: str = _DEFAULT_SCOPE
    #: The application's own session length, deliberately not the token's few
    #: minutes: reading expiry off a token makes session length hostage to clock
    #: drift between two machines.
    session_ttl_seconds: int = _DEFAULT_SESSION_TTL
    jwks_cache_seconds: int = _DEFAULT_JWKS_CACHE
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        if not self.issuer:
            raise ValueError("caselaw-auth-server: issuer is required")
        if not self.session_secret:
            raise ValueError("caselaw-auth-server: session_secret is required")
        self.issuer = self.issuer.rstrip("/")


@dataclass
class ServerAuth:
    config: ServerAuthConfig
    _discovery: dict[str, Any] | None = field(default=None, init=False, repr=False)
    _jwks: tuple[PyJWKClient, float] | None = field(default=None, init=False, repr=False)

    # ── discovery ────────────────────────────────────────────────────────────

    def discover(self) -> dict[str, Any]:
        """Fetches and memoises the realm's discovery document."""
        if self._discovery is not None:
            return self._discovery
        url = f"{self.config.issuer}/.well-known/openid-configuration"
        try:
            response = httpx.get(url, timeout=self.config.timeout_seconds)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise AuthBackendUnavailable(f"discovery failed: {exc}") from exc
        self._discovery = response.json()
        return self._discovery

    # ── sign-in ──────────────────────────────────────────────────────────────

    def authorization_url(
        self,
        *,
        state: str,
        code_challenge: str | None = None,
        nonce: str | None = None,
        prompt: str | None = None,
        login_hint: str | None = None,
    ) -> str:
        """Where to send the browser to start a sign-in."""
        params = {
            "response_type": "code",
            "client_id": self.config.client_id,
            "redirect_uri": self.config.redirect_uri,
            "scope": self.config.scope,
            "state": state,
        }
        if code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"
        if nonce:
            params["nonce"] = nonce
        if prompt:
            params["prompt"] = prompt
        if login_hint:
            params["login_hint"] = login_hint
        return f"{self.discover()['authorization_endpoint']}?{urlencode(params)}"

    def exchange_code(self, *, code: str, code_verifier: str | None = None) -> dict[str, Any]:
        """Redeems the authorization code. Server-side, so the secret stays here."""
        body = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.config.redirect_uri,
            "client_id": self.config.client_id,
        }
        if code_verifier:
            body["code_verifier"] = code_verifier
        if self.config.client_secret:
            body["client_secret"] = self.config.client_secret

        try:
            response = httpx.post(
                self.discover()["token_endpoint"],
                data=body,
                timeout=self.config.timeout_seconds,
            )
        except httpx.HTTPError as exc:
            raise AuthBackendUnavailable(f"token exchange failed: {exc}") from exc

        if response.status_code >= 400:
            # The body carries `error_description`, which is the difference
            # between "redirect URI does not match" and "client secret is wrong"
            # — both of which otherwise arrive as an opaque 400.
            raise AuthError(f"token exchange failed with {response.status_code}: {response.text}")
        return response.json()

    # ── verification ─────────────────────────────────────────────────────────

    def _jwks_client(self, force: bool = False) -> PyJWKClient:
        now = time.time()
        if self._jwks and not force and now - self._jwks[1] < self.config.jwks_cache_seconds:
            return self._jwks[0]
        url = self.discover().get(
            "jwks_uri", f"{self.config.issuer}/protocol/openid-connect/certs"
        )
        client = PyJWKClient(url, timeout=int(self.config.timeout_seconds))
        self._jwks = (client, now)
        return client

    def verify_token(
        self,
        token: str,
        *,
        audience: str | None = None,
        azp: str | None = None,
        nonce: str | None = None,
    ) -> dict[str, Any]:
        """Verifies a token's signature and claims against the realm.

        Offline against the cached key set, so this is not a network call per
        request. It retries once against a freshly fetched set, because the
        cache expires and a single blip on the refetch would otherwise fail a
        request with nothing wrong with it — the access service learned that by
        turning a filled-in form into a bare 503.

        ``audience`` is off by default on purpose: Keycloak puts ``account``
        there for a public client's access token and names the requesting client
        in ``azp``, so checking it rejects every valid token.
        """
        last_error: Exception | None = None
        for attempt in (0, 1):
            try:
                key = self._jwks_client(force=bool(attempt)).get_signing_key_from_jwt(token).key
                claims = jwt.decode(
                    token,
                    key,
                    algorithms=_ALGORITHMS,
                    issuer=self.config.issuer,
                    audience=audience,
                    options={"verify_aud": audience is not None},
                )
                break
            except InvalidTokenError as exc:
                raise InvalidToken(str(exc)) from exc
            except (PyJWKClientError, httpx.HTTPError, ValueError) as exc:
                last_error = exc
                self._jwks = None
                if attempt:
                    raise AuthBackendUnavailable(str(last_error)) from last_error
        if not isinstance(claims, dict) or not claims.get("sub"):
            raise InvalidToken("token carries no subject")
        if azp and claims.get("azp") != azp:
            raise InvalidToken("token was issued to a different client")
        if nonce and claims.get("nonce") != nonce:
            raise InvalidToken("nonce does not match")
        return claims

    # ── sessions ─────────────────────────────────────────────────────────────

    def roles_from_claims(self, claims: Mapping[str, Any]) -> list[str]:
        """Realm roles plus this client's roles, de-duplicated, realm first."""
        realm = (claims.get("realm_access") or {}).get("roles") or []
        client = ((claims.get("resource_access") or {}).get(self.config.client_id) or {}).get(
            "roles"
        ) or []
        seen: dict[str, None] = {}
        for role in [*realm, *client]:
            seen.setdefault(role, None)
        return list(seen)

    def session_from_claims(
        self, claims: Mapping[str, Any], *, id_token: str | None = None
    ) -> dict[str, Any]:
        """Builds the session a callback route should store, from verified claims.

        Note what is absent: the access token. Keeping one bloats the cookie
        toward the browser's limit and buys nothing unless something downstream
        actually calls an API as the user — and a token in a cookie leaks with
        the cookie. Where one is genuinely needed, put it in a cookie of its own.
        """
        username = claims.get("preferred_username")
        session: dict[str, Any] = {
            "user": {
                "id": str(claims["sub"]),
                "email": claims.get("email") or username or None,
                "name": claims.get("name") or username or None,
            },
            "roles": self.roles_from_claims(claims),
            "expiresAt": int(time.time()) + self.config.session_ttl_seconds,
        }
        if id_token:
            session["idToken"] = id_token
        return session

    def _signature(self, payload: str) -> str:
        return _b64url_encode(
            hmac.new(
                self.config.session_secret.encode("utf-8"),
                payload.encode("utf-8"),
                hashlib.sha256,
            ).digest()
        )

    def seal_session(self, session: Mapping[str, Any], cookie_name: str = "caselaw_session") -> str:
        """Signs a session into a cookie value.

        Signed, not encrypted: the contents are the user's own identity, which
        they already know. What matters is that they cannot change it — an
        unsigned cookie lets anyone promote themselves by editing a role.

        Raises above the browser's limit rather than returning something the
        browser will drop. A dropped cookie presents as the application signing
        the user straight back out, which reads as broken authentication rather
        than an oversized session.
        """
        payload = _b64url_encode(_dumps(session).encode("utf-8"))
        value = f"{payload}.{self._signature(payload)}"
        size = len(f"{cookie_name}={value}".encode("utf-8"))
        if size > COOKIE_BYTE_LIMIT:
            raise SessionTooLarge(
                f"session cookie is {size} bytes, over the {COOKIE_BYTE_LIMIT}-byte browser "
                "limit. Something oversized is in the session — an access token is the usual "
                "culprit."
            )
        return value

    def unseal_session(self, value: str | None) -> dict[str, Any] | None:
        """Verifies and decodes a cookie value.

        Returns ``None`` for anything untrusted or expired, and never raises: a
        tampered cookie and an absent one lead to the same place, and telling
        them apart only informs an attacker which half they got right.
        """
        if not value or value.count(".") != 1:
            return None
        payload, signature = value.split(".", 1)
        if not payload or not signature:
            return None
        if not hmac.compare_digest(signature, self._signature(payload)):
            return None
        try:
            session = json.loads(_b64url_decode(payload).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None
        if not isinstance(session, dict):
            return None
        user = session.get("user")
        if not isinstance(user, dict) or not user.get("id"):
            return None
        expires_at = session.get("expiresAt")
        if not isinstance(expires_at, (int, float)) or expires_at <= time.time():
            return None
        return session

    # ── cookies and sign-out ─────────────────────────────────────────────────

    def cookie_options(
        self, max_age_seconds: int, *, secure: bool = True, path: str = "/"
    ) -> dict[str, Any]:
        """Attributes for the session cookie.

        ``httpOnly`` is the whole point: script on the page cannot read it, so an
        XSS that would walk off with a ``localStorage`` session gets nothing.
        ``sameSite='lax'`` still allows the top-level redirect back from the
        identity provider, which ``strict`` would drop — leaving the user signed
        in everywhere except the page they just landed on.
        """
        return {
            "httpOnly": True,
            "sameSite": "lax",
            "secure": secure,
            "path": path,
            "maxAge": max(0, max_age_seconds),
        }

    def serialize_cookie(self, name: str, value: str, options: Mapping[str, Any]) -> str:
        """A ``Set-Cookie`` value, for frameworks without a cookie helper."""
        parts = [
            f"{name}={value}",
            f"Path={options.get('path', '/')}",
            f"Max-Age={options.get('maxAge', 0)}",
            "SameSite=Lax",
        ]
        if options.get("httpOnly"):
            parts.append("HttpOnly")
        if options.get("secure"):
            parts.append("Secure")
        return "; ".join(parts)

    def end_session_url(self, *, id_token: str | None = None, return_to: str | None = None) -> str:
        """Where to send the browser to sign out.

        Passing ``id_token_hint`` is what makes this a real single sign-out.
        Without it Keycloak keeps its own session and the next sign-in completes
        with no prompt, which looks like the sign-out silently failed.
        """
        endpoint = self.discover().get("end_session_endpoint")
        if not endpoint:
            return return_to or "/"
        params: dict[str, str] = {}
        if id_token:
            params["id_token_hint"] = id_token
        if return_to:
            params["post_logout_redirect_uri"] = return_to
        if not id_token and return_to:
            params["client_id"] = self.config.client_id
        return f"{endpoint}?{urlencode(params)}"


def create_server_auth(
    issuer: str,
    client_id: str,
    redirect_uri: str,
    session_secret: str,
    **kwargs: Any,
) -> ServerAuth:
    """Mirrors ``createServerAuth`` in the TypeScript package."""
    return ServerAuth(
        ServerAuthConfig(
            issuer=issuer,
            client_id=client_id,
            redirect_uri=redirect_uri,
            session_secret=session_secret,
            **kwargs,
        )
    )
