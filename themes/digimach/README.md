# DigiMach Keycloak theme

This theme gives DigiMach the same authentication-state coverage as the
`caselaw` theme without duplicating it. Both theme types inherit the Case Law
implementation and load a DigiMach brand layer after the shared stylesheet.
That includes registration, passwords, recovery, errors, identity switching,
social/authenticator choices, responsive behavior, the six-slot email OTP
experience, and the account console.

These are theme capabilities, not a list of enabled login methods. The deployed
DigiMach realm uses email-only OTP, with magic-link sign-in disabled. Its login
favicon uses the same green DM mark. See the
[DigiMach handoff](../../docs/DIGIMACH_HANDOFF.md) for current issuer, retained
localhost callbacks, unchanged sender and pending DNS/application cutover.

The colors and mark are based on [digimach.eu](https://digimach.eu/):

- brand green `#33a58e`
- interactive green `#2a8472` and hover green `#0d6251`
- pale brand surface `#edf4f3`
- deep blue-black text `#021728`

## Selecting the theme

For an address such as `auth.digimach.eu`, also follow
[Project authentication domains](../../docs/PROJECT_AUTH_DOMAINS.md). Theme
selection changes appearance; the realm Frontend URL and application issuer
configuration determine the authentication domain.

The Docker image already copies the complete `themes/` directory, so a build
from this repository exposes `digimach` in Keycloak's theme selectors.

For the **Digimach realm**, select `digimach` for both **Login theme** and
**Account theme** under **Realm settings → Themes**. These realm defaults apply
the Digimach look to every client connected to that realm and do not affect the
separate Case Law realm.

After deploying the image, the same settings can be applied to an existing
realm with the repository script:

```sh
KEYCLOAK_URL=https://auth.example.tech \
KEYCLOAK_REALM=digimach \
KEYCLOAK_THEME=digimach \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=... \
./scripts/apply-themes.sh
```

Keycloak also supports a client-level Login theme override if a Digimach client
ever has to live in a shared realm. The Account theme is realm-wide, however,
so the dedicated realm is the only way to give all login and account screens a
coherent Digimach identity without changing another product's account console.

Deploy the image before selecting the theme. For local development, run:

```sh
docker compose -f compose.local.yml up
```

Theme resources are cached in production. When changing a DigiMach stylesheet,
add a new versioned filename and update its `theme.properties` entry.

`preview.html` is a static visual check for the login theme and can be opened
directly in a browser; it is not loaded by Keycloak in production.
