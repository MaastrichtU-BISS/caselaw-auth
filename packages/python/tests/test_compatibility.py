import importlib
import time

import biss_auth_server as new
import caselaw_auth_server as old


def test_public_api_and_exception_identity():
    assert new.__all__ == old.__all__
    for name in old.__all__:
        assert getattr(new, name) is getattr(old, name)
        assert getattr(importlib.import_module("biss_auth_server.server"), name) is getattr(old, name)


def test_old_and_new_sessions_survive_switching():
    config = dict(issuer="https://issuer.example/realms/test", client_id="test",
                  redirect_uri="https://app.example/callback", session_secret="test-secret")
    legacy = old.create_server_auth(**config)
    renamed = new.create_server_auth(**config)
    session = {"user": {"id": "user-1"}, "roles": [], "expiresAt": int(time.time()) + 3600}
    assert renamed.unseal_session(legacy.seal_session(session)) == session
    assert legacy.unseal_session(renamed.seal_session(session)) == session


def test_legacy_module_is_the_canonical_module():
    assert importlib.import_module("caselaw_auth_server.server") is importlib.import_module("biss_auth_server.server")


def test_legacy_import_warning_is_visible_to_developers():
    import subprocess
    import sys
    result = subprocess.run(
        [sys.executable, "-Wd", "-c", "import caselaw_auth_server; import caselaw_auth_server.server"],
        check=True, capture_output=True, text=True,
    )
    assert result.stderr.count("DeprecationWarning:") == 1
    assert "biss-auth-server>=0.3.1" in result.stderr
    assert "biss_auth_server" in result.stderr
    canonical = subprocess.run(
        [sys.executable, "-Wd", "-c", "import biss_auth_server; import biss_auth_server.server"],
        check=True, capture_output=True, text=True,
    )
    assert "DeprecationWarning" not in canonical.stderr
