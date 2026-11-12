"""Alias the canonical module, retaining legacy public and private imports."""
import sys
from biss_auth_server import server as _implementation

sys.modules[__name__] = _implementation
