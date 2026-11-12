"""Legacy imports for standalone BISS Auth; public object identities are shared."""
from biss_auth_server import *  # noqa: F401,F403
from biss_auth_server import __all__
from importlib.metadata import version

__version__ = version("caselaw-auth-server")

import warnings as _warnings

_warnings.warn(
    "caselaw-auth-server is deprecated; install biss-auth-server>=0.3.1 and "
    "replace caselaw_auth_server imports with biss_auth_server. Keep your issuer, "
    "clients, session secrets and cookie settings unchanged. "
    "Existing imports remain supported for compatibility.",
    DeprecationWarning,
    stacklevel=2,
)
