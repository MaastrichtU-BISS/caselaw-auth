#!/usr/bin/env sh
set -eu

base_url="${1:-http://localhost:8080}"

curl -fsS "$base_url/realms/master/.well-known/openid-configuration" >/dev/null
curl -fsS "$base_url/realms/caselaw/.well-known/openid-configuration" >/dev/null

echo "Keycloak smoke check passed for $base_url"

