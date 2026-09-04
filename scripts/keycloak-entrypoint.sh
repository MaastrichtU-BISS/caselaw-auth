#!/bin/sh

set -u

keycloak=/opt/keycloak/bin/kc.sh
configurator=/opt/keycloak/bin/caselaw-passwordless-configurator

case "${CASELAW_PASSWORDLESS_AUTO_APPLY:-false}" in
  true|TRUE|1|yes|YES) auto_apply=true ;;
  *) auto_apply=false ;;
esac

if [ "$auto_apply" != true ] || [ "${1:-}" != start ]; then
  exec "$keycloak" "$@"
fi

"$keycloak" "$@" &
keycloak_pid=$!

stop_keycloak() {
  kill -TERM "$keycloak_pid" 2>/dev/null || true
  wait "$keycloak_pid"
}

trap stop_keycloak TERM INT

(
  if "$configurator"; then
    echo "Case Law passwordless realm configuration is current."
  else
    echo "WARNING: passwordless realm configuration failed; Keycloak will remain available on its previous browser flow." >&2
  fi
) &
configurator_pid=$!

wait "$keycloak_pid"
status=$?
kill -TERM "$configurator_pid" 2>/dev/null || true
wait "$configurator_pid" 2>/dev/null || true
exit "$status"
