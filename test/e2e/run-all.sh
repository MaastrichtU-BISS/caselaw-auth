#!/bin/sh

set -eu

project="caselaw-auth-e2e-${GITHUB_RUN_ID:-local}"
base="-f docker-compose.yml -f test/e2e/docker-compose.yml"
legacy="$base -f test/e2e/docker-compose.no-auto.yml"

export KEYCLOAK_POSTGRES_PASSWORD=passwordless-e2e-db
export KEYCLOAK_ADMIN=admin
export KEYCLOAK_ADMIN_PASSWORD=passwordless-e2e-admin

cleanup() {
  # shellcheck disable=SC2086
  docker compose -p "$project" $legacy down -v >/dev/null 2>&1 || true
}
finish() {
  test_status=$?
  if [ "$test_status" -ne 0 ]; then
    # Only disposable test containers; preserve diagnostics before removing them.
    # shellcheck disable=SC2086
    docker compose -p "$project" $legacy logs --tail=100 || true
  fi
  cleanup
  exit "$test_status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cleanup
# shellcheck disable=SC2086
docker compose -p "$project" $base up -d --build
npm run test:passwordless-e2e
node test/e2e/project-auth-domains.mjs

# shellcheck disable=SC2086
docker compose -p "$project" $base down -v
# shellcheck disable=SC2086
docker compose -p "$project" $legacy up -d
npm run test:passwordless-legacy-upgrade
npm run test:passwordless-e2e
npm run test:unverified-cleanup-e2e
