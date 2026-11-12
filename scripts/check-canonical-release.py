"""Legacy releases must never precede their exact canonical dependency."""
import json
import sys
import tomllib
from pathlib import Path
from urllib.request import urlopen

if sys.argv[1] == 'npm':
    package = json.loads(Path('packages/caselaw-auth/package.json').read_text())
    version = package['dependencies']['biss-auth']
    url = f'https://registry.npmjs.org/biss-auth/{version}'
    with urlopen(url) as response:
        release = json.load(response)
    assert release['version'] == version
    assert 'caselaw-auth' not in release.get('dependencies', {})
else:
    package = tomllib.loads(Path('packages/python/pyproject.toml').read_text())
    dependency, = package['project']['dependencies']
    version = dependency.split('==')[1]
    with urlopen(f'https://pypi.org/pypi/biss-auth-server/{version}/json') as response:
        release = json.load(response)
    assert release['info']['version'] == version
    assert not any('caselaw' in item.lower() for item in release['info']['requires_dist'] or [])
print(f'Canonical standalone {sys.argv[1]} release {version} is available')
