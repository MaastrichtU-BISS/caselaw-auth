"""Server-side OIDC for Python products, interchangeable with ``caselaw-auth/server``."""

from .server import (
    COOKIE_BYTE_LIMIT,
    AuthBackendUnavailable,
    AuthError,
    InvalidToken,
    ServerAuth,
    ServerAuthConfig,
    SessionTooLarge,
    create_pkce_pair,
    create_server_auth,
    random_token,
)

__all__ = [
    "COOKIE_BYTE_LIMIT",
    "AuthBackendUnavailable",
    "AuthError",
    "InvalidToken",
    "ServerAuth",
    "ServerAuthConfig",
    "SessionTooLarge",
    "create_pkce_pair",
    "create_server_auth",
    "random_token",
]

# Read from the installed distribution rather than written here: a hardcoded
# string is one more place to forget, and it reported 0.1.0 from a 0.2.0 install
# until this was noticed.
try:  # pragma: no cover - trivial
    from importlib.metadata import version as _version

    __version__ = _version("caselaw-auth-server")
except Exception:  # not installed, e.g. running straight from a checkout
    __version__ = "0+unknown"
