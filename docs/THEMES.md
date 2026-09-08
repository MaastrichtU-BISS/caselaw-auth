# Applying Keycloak themes

This repository ships two complete Keycloak themes in its Docker image:

| Theme | Use for | Coverage |
|---|---|---|
| `caselaw` | Case Law Explorer realms and projects | Login, registration, recovery, errors, email OTP, responsive behavior, and account console |
| `digimach` | DigiMach realms and projects | The same coverage inherited from `caselaw`, with DigiMach colors, mark, typography, and surfaces |

Theme names are lowercase and case-sensitive. Deploy an image built from this
repository before selecting a theme; otherwise it will not appear in Keycloak's
theme list.

Theme selection changes presentation, not OTP policy or the OIDC issuer. See
[rollout status](AUTH_ROLLOUT_STATUS.md) for the deployed themes and
[DigiMach handoff](DIGIMACH_HANDOFF.md) for its prepared domain and active issuer.

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

### Project favicons (browser-tab icons)

The login favicon follows the selected **Login theme**, including client-level
overrides. `caselaw` uses the Case Law Explorer demo platform's network icon;
`digimach` uses the same green DM mark as `digimach.eu`. Email entry, OTP,
registration, recovery and login error pages inherit that choice. No frontend
or server-side auth SDK change, DNS change, SMTP setting or environment variable
is needed. The Account console is a separate theme surface.

For a new connected project:

1. Give the auth-service maintainer the project's approved favicon (a trusted,
   self-contained SVG or PNG). It is not automatically fetched from a client's
   website or redirect URL.
2. In that project's login theme, add the file under
   `themes/<project>/login/resources/img/`, for example `project-favicon-v1.svg`.
3. Set `favicons=img/project-favicon-v1.svg` in the theme's `login/theme.properties`.
   A child theme must declare its own favicon; otherwise it inherits its parent's.
   New themes can use `parent=caselaw` to inherit the shared forms and layout, but
   should also supply their own branding layer (see the `digimach` example).
4. Build and deploy the shared Keycloak image, then select the theme under
   **Realm settings → Themes → Login theme**, or the individual client's
   **Login theme** setting described above. Selecting an already deployed theme
   requires no repository clone for the project administrator.
5. Start sign-in from that project and check both the email and OTP tabs. The
   favicon request must return 200 from the auth origin, not the application
   origin or a third-party icon service. For a replacement icon, use a new filename
   and update `favicons` to avoid browser favicon caching; check a fresh tab too.

This uses the [native Keycloak favicon theme property](https://www.keycloak.org/ui-customization/themes#_theme_properties)
supported by the pinned Keycloak 26.7 image. Do not copy or fork the base login
template just to change the favicon.

### Other theme checks

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

## Short screens and footer layout

Both login themes use the shared versioned `caselaw-login-v9.css` entry point.
The related-links footer stays in normal flow beneath the form, inside the card;
it is not fixed to the viewport. Short windows and mobile keyboards may require
scrolling, but must never cover code entry, verification or resend controls.
Check desktop, mobile portrait, landscape and reduced-height viewports after theme
changes. Keep the white grid and each theme's branding when adjusting layout.
