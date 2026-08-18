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

__version__ = "0.1.0"
