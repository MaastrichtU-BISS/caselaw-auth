# Bizzash Keycloak theme

Bizzash, the BISS success dashboard (<https://bizzash.biss-institute.com>),
signs in through its own `bizzash` realm on the shared Keycloak, served at
`https://auth.biss-institute.com`. Like `digimach`, both theme types inherit
the complete `caselaw` implementation (passwordless email OTP, every login
state, the account console) and load a Bizzash brand layer afterwards.

The look follows the Bizzash app: warm off-white surfaces, thin borders, Inter,
BISS blue `#005CA9` as the one accent and the yellow `#FFC917` of the wordmark.
On screens 960px and wider, Bizzy, the Bizzash assistant, sits in a quiet panel
to the left of the form; narrower screens show the form alone.

| File | Purpose |
|---|---|
| `login/resources/css/bizzash-login-v1.css` | Brand layer over `caselaw-login-v10.css` |
| `login/resources/img/bizzy-v1.svg` | Bizzy with a slow bob and blink, still under reduced motion |
| `login/resources/img/bizzash-wordmark-v1.png` | Wordmark at 4× from the app's `BWordmark` |
| `login/resources/img/bizzash-mark-v2.svg` | Favicon: a sheet in BISS blue with a white table and the yellow band, as in the app |
| `account/resources/css/bizzash-account-v1.css` | Bizzash tokens for the account console |

Bizzash has no public legal documents, so the theme sets the legal URLs empty
instead of inheriting Case Law Explorer's. A client's own Terms/Policy URLs
still take precedence if they are ever added.

## Selecting the theme

Select `bizzash` for **Login theme** and **Account theme** under **Realm
settings → Themes** of the `bizzash` realm, or run `scripts/apply-themes.sh`
with `KEYCLOAK_REALM=bizzash KEYCLOAK_THEME=bizzash`. For the domain, see
[Project authentication domains](../../docs/PROJECT_AUTH_DOMAINS.md).

Theme resources are cached in production: when changing a stylesheet or image,
add a new versioned filename and update `theme.properties`.

`preview.html` is a static visual check of the email step and can be opened
directly in a browser; Keycloak does not load it.
