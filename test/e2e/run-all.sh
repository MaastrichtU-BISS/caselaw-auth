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
trap cleanup EXIT INT TERM

cleanup
# shellcheck disable=SC2086
docker compose -p "$project" $base up -d --build
npm run test:passwordless-e2e

# shellcheck disable=SC2086
docker compose -p "$project" $base down -v
# shellcheck disable=SC2086
docker compose -p "$project" $legacy up -d
npm run test:passwordless-legacy-upgrade
npm run test:passwordless-e2e
npm run test:unverified-cleanup-e2e
