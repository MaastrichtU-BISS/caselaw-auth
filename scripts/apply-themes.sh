#!/usr/bin/env sh
# Point a running realm at the themes in this repository.
#
# realm/caselaw-realm.json is an import file. Keycloak imports it when the
# realm does not exist and leaves it alone forever after, so editing
# loginTheme or accountTheme there changes nothing on a deployment that is
# already running - the realm's settings live in its database. This applies
# them to the realm as it is now.
#
# Deploy first. Selecting a theme that is not in the image gives you a realm
# pointing at nothing.
#
# Usage:
#   KEYCLOAK_URL=https://auth.example.tech \
#   KEYCLOAK_ADMIN=admin \
#   KEYCLOAK_ADMIN_PASSWORD=... \
#   ./scripts/apply-themes.sh
set -eu

base_url="${KEYCLOAK_URL:-http://localhost:8080}"
realm="${KEYCLOAK_REALM:-caselaw}"
theme="${KEYCLOAK_THEME:-caselaw}"
admin_user="${KEYCLOAK_ADMIN:-}"
admin_password="${KEYCLOAK_ADMIN_PASSWORD:-}"

if [ -z "$admin_user" ] || [ -z "$admin_password" ]; then
    echo "Set KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD." >&2
    exit 2
fi

token=$(
    curl -fsS "$base_url/realms/master/protocol/openid-connect/token" \
        -d grant_type=password \
        -d client_id=admin-cli \
        --data-urlencode "username=$admin_user" \
        --data-urlencode "password=$admin_password" |
        sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
)

if [ -z "$token" ]; then
    echo "Could not get an admin token from $base_url." >&2
    exit 1
fi

# A realm update is a merge, so naming only the two theme keys leaves every
# other realm setting untouched. Sending a whole exported realm back would
# not, which is why this does not do that.
curl -fsS -X PUT "$base_url/admin/realms/$realm" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "{\"loginTheme\":\"$theme\",\"accountTheme\":\"$theme\"}"

applied=$(
    curl -fsS "$base_url/admin/realms/$realm" -H "Authorization: Bearer $token" |
        tr ',' '\n' | grep -E '"(login|account)Theme"' | tr -d ' '
)

echo "Applied to $realm on $base_url:"
echo "$applied"
echo
echo "Themes are cached. If the console still looks unstyled, hard reload;"
echo "if it still does, the deployment is serving an image built before the"
echo "theme was added."
