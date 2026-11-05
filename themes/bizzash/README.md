# Bizzy Keycloak theme (`bizzash`)

Bizzy (<https://bizzy.biss-institute.com>), the deals, projects and people
system for Maastricht University teams made at BISS, signs in through its own
`bizzash` realm on the shared Keycloak. The product was called Bizzash at
first; the realm and the theme keep that name so no realm or client setting has
to change. Like `digimach`, both theme types inherit the complete `caselaw`
implementation (passwordless email OTP, every login state, the account console)
and load a Bizzy brand layer afterwards.

The look follows the Bizzy app (`app/assets/css/theme.css` and the welcome
page): warm off-white surfaces, thin warm borders, Inter for text and Overpass
for display type, BISS blue `#005CA9` as the one accent, navy `#0B2340` and the
yellow `#FFC917` of Bizzy's band. The card starts with the brand as the app
writes it: Bizzy, then BIZZY in thin, spaced, outlined capitals. On screens
960px and wider a panel on the left carries the welcome page's headline and
Bizzy standing on a block of his blue with the yellow band; narrower screens
show the form alone. The panel's text is English, and Dutch when Keycloak marks
the page `lang="nl"` (realm internationalisation on, Dutch selected).

| File | Purpose |
|---|---|
| `login/resources/css/bizzy-login-v1.css` | Brand layer over `caselaw-login-v10.css` |
| `login/resources/fonts/*.woff2` | Inter and Overpass (latin, latin-ext; SIL OFL, licences beside them), served by Keycloak: no Google Fonts |
| `login/resources/img/bizzy-v2.svg` | Bizzy as the app's engine draws him (idle), with a slow bob and blink, still under reduced motion |
| `login/resources/img/bizzash-mark-v2.svg` | Favicon: the app's own `favicon.svg` |
| `login/messages/messages_{en,nl}.properties` | Tab title and header from the realm's display name (`Sign in to {0}`; set to "Bizzy" on the server), the email step's heading "Sign in to Bizzy"; all other copy comes from `caselaw` |
| `account/resources/css/bizzash-account-v1.css` | Bizzy tokens for the account console |

Bizzy has no public legal documents, so the theme sets the legal URLs empty
instead of inheriting Case Law Explorer's. A client's own Terms/Policy URLs
still take precedence if they are ever added. The footer's product link
defaults to Bizzy; `BIZZASH_AUTH_FOOTER_*` environment variables override it.

## Selecting the theme

Select `bizzash` for **Login theme** and **Account theme** under **Realm
settings → Themes** of the `bizzash` realm, or run `scripts/apply-themes.sh`
with `KEYCLOAK_REALM=bizzash KEYCLOAK_THEME=bizzash`. A realm that already uses
`bizzash` needs nothing beyond deploying the new image. For the domain, see
[Project authentication domains](../../docs/PROJECT_AUTH_DOMAINS.md).

Theme resources are cached in production: when changing a stylesheet or image,
add a new versioned filename and update `theme.properties`.

`preview.html` is a static visual check of the email step and can be opened
directly in a browser; Keycloak does not load it.
