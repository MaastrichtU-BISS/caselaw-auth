"""Install built wheels in isolation, proving canonical independence and legacy identity."""
import tomllib
from pathlib import Path
import subprocess
import tempfile
import venv

root = Path(__file__).resolve().parents[2]
def wheel(directory, name):
    version = tomllib.loads((root / directory / 'pyproject.toml').read_text())['project']['version']
    return root / directory / 'dist' / f'{name}-{version}-py3-none-any.whl'

canonical = wheel('packages/python-biss', 'biss_auth_server')
legacy = wheel('packages/python', 'caselaw_auth_server')
with tempfile.TemporaryDirectory(prefix='biss-python-package-') as directory:
    venv.create(directory, with_pip=True)
    python = str(Path(directory) / 'bin/python')
    subprocess.run([python, '-m', 'pip', 'install', '--disable-pip-version-check', str(canonical)], check=True)
    subprocess.run([python, '-c', '''
import importlib.util, importlib.metadata
import biss_auth_server as auth
assert importlib.util.find_spec('caselaw_auth_server') is None
assert not any('caselaw' in r.lower() for r in importlib.metadata.requires('biss-auth-server'))
config = dict(issuer='https://issuer.example/realms/test', client_id='test', redirect_uri='https://app.example/callback', session_secret='package-test')
a = auth.create_server_auth(**config)
s = {'user': {'id': 'user-1'}, 'roles': [], 'expiresAt': 4102444800}
assert a.unseal_session(a.seal_session(s)) == s
print('Standalone wheel works without the legacy distribution')
'''], check=True, cwd=directory)
    subprocess.run([python, '-m', 'pip', 'install', '--disable-pip-version-check', str(legacy)], check=True)
    subprocess.run([python, '-c', '''
import importlib
import biss_auth_server as new
import caselaw_auth_server as old
assert old.__all__ == new.__all__
assert all(getattr(old, n) is getattr(new, n) for n in old.__all__)
assert importlib.import_module('caselaw_auth_server.server') is importlib.import_module('biss_auth_server.server')
config = dict(issuer='https://issuer.example/realms/test', client_id='test', redirect_uri='https://app.example/callback', session_secret='package-test')
a, b = old.create_server_auth(**config), new.create_server_auth(**config)
s = {'user': {'id': 'user-1'}, 'roles': [], 'expiresAt': 4102444800}
assert b.unseal_session(a.seal_session(s)) == s
assert a.unseal_session(b.seal_session(s)) == s
print('Legacy wheel forwards APIs, exceptions and sessions to BISS')
'''], check=True, cwd=directory)
