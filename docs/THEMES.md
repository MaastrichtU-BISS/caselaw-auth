# Applying Keycloak themes

This repository ships two complete Keycloak themes in its Docker image:

| Theme | Use for | Coverage |
|---|---|---|
| `caselaw` | Case Law Explorer realms and projects | Login, registration, recovery, errors, email OTP, responsive behavior, and account console |
| `digimach` | DigiMach realms and projects | The same coverage inherited from `caselaw`, with DigiMach colors, mark, typography, and surfaces |

Theme names are lowercase and case-sensitive. Deploy an image built from this
repository before selecting a theme; otherwise it will not appear in Keycloak's
theme list.

## Choose the correct scope

In Keycloak, an application or project is represented by an OIDC **client**.
Theme settings exist at two scopes:

| Goal | Configure | Result |
|---|---|---|
| Give every project in a realm one identity | Realm **Login theme** and **Account theme** | All clients in that realm use the selected theme |
| Change only one project in a shared realm | Client **Login theme** | Only that client's login, OTP, registration, and recovery screens change |
| Give a project its own login and account-console identity | A dedicated realm with both realm themes set | Login and account screens both use the project's theme |

The Account theme is realm-wide; Keycloak has no client-level Account theme
override. Leave a client's Login theme unset when it should inherit its realm's
default.

## Apply a theme to a realm

Use this for the `digimach` realm so every Digimach client gets the DigiMach
login and account experience.

### Admin Console

1. Deploy the Keycloak image containing `themes/digimach/`.
2. Open the Admin Console and select the target realm, for example `digimach`.
3. Open **Realm settings → Themes**.
4. Set **Login theme** to `digimach`.
5. Set **Account theme** to `digimach`.
6. Save.

The separate `caselaw` realm keeps its own `caselaw` settings.

### Existing realm, using the repository script

Realm imports only create missing realms; editing an import JSON file does not
update a realm already stored in Keycloak's database. After deploying the new
image, apply both settings to an existing realm with:

```sh
KEYCLOAK_URL=https://auth.example.tech \
KEYCLOAK_REALM=digimach \
KEYCLOAK_THEME=digimach \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=... \
./scripts/apply-themes.sh
```

`KEYCLOAK_REALM` and `KEYCLOAK_THEME` both default to `caselaw`; set them
explicitly for every other realm. The script changes the target realm's Login
and Account themes and leaves its other settings untouched.

### New realm import

A new realm JSON file can select the defaults before its first import:

```json
{
  "realm": "digimach",
  "displayName": "DigiMach",
  "loginTheme": "digimach",
  "accountTheme": "digimach"
}
```

This only takes effect when Keycloak creates the realm. Use the script or Admin
Console for a realm that already exists.

## Apply a login theme to one project

Use this only when one project needs a different login look but must remain in
a shared realm:

1. Open the Admin Console and select the realm containing the project.
2. Open **Clients → _project client_ → Settings**.
3. Under **Login settings**, set **Login theme** to the required theme.
4. Save.

This overrides the realm Login theme for authorization requests from that
client. It does not change the realm's account console. Clear the field to make
the client inherit the realm default again.

## Verify and troubleshoot

Start a fresh authorization request using the target project's client ID. A
realm-wide change should appear for every client in that realm; a client-level
override should appear only for that client.

- **Theme is absent from the selector:** the running image predates the theme;
  rebuild and deploy it first.
- **Old colors remain:** hard-reload or use a private window. Keycloak and the
  browser both cache theme resources in production.
- **Only one project changed:** check for a client-level Login theme override.
- **Login changed but the account console did not:** client overrides cover
  Login only; set the realm Account theme or use a dedicated realm.
- **Local styling work does not refresh:** run
  `docker compose -f compose.local.yml up`, which mounts `themes/` and disables
  theme caching.

The static DigiMach login preview is at
[`themes/digimach/preview.html`](../themes/digimach/preview.html).
