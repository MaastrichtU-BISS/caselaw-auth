#!/bin/sh

set -u

# Java4Shell (CVE-2026-114938): the HotSpot Base64 intrinsic in Java 17.0.6+,
# 21, 25 and 27 can be driven to remote code execution. The Keycloak image ships
# Red Hat OpenJDK 21.0.12, and no fixed Keycloak image exists yet. Disabling the
# intrinsic is the vendor-recommended mitigation. It is appended here rather
# than set in compose so an operator's own JAVA_OPTS_APPEND cannot drop it.
# Remove once the pinned Keycloak image ships a fixed JDK (21.0.13.1 or later).
java4shell_mitigation=-XX:-UseBASE64Intrinsics
case " ${JAVA_OPTS_APPEND:-} " in
  *" $java4shell_mitigation "*) ;;
  *) JAVA_OPTS_APPEND="${JAVA_OPTS_APPEND:+$JAVA_OPTS_APPEND }$java4shell_mitigation" ;;
esac
export JAVA_OPTS_APPEND

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
