"""BISS Auth: the same public API and class identities as caselaw_auth_server."""
from caselaw_auth_server import *  # noqa: F401,F403
from caselaw_auth_server import __all__
from importlib.metadata import version

__version__ = version("biss-auth-server")
