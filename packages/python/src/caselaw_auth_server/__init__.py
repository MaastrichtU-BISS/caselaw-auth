"""Legacy imports for standalone BISS Auth; public object identities are shared."""
from biss_auth_server import *  # noqa: F401,F403
from biss_auth_server import __all__
from importlib.metadata import version

__version__ = version("caselaw-auth-server")
