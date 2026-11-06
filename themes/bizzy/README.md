# Bizzy Keycloak theme (`bizzy`)

Bizzy (<https://bizzy.biss-institute.com>), the deals, projects and people
system for Maastricht University teams made at BISS, signs in through its own
`bizzy` realm on the shared Keycloak. The product, realm and theme were called
Bizzash at first; `themes/bizzash` stays until the realm uses this theme, then
goes. Like `digimach`, both theme types inherit the complete `caselaw`
implementation (passwordless email OTP, every login state, the account console)
and load a Bizzy brand layer afterwards.

The look follows the Bizzy app (`app/assets/css/theme.css` and the welcome
page): warm off-white surfaces, thin warm borders, Inter for text and Overpass
for display type, BISS blue `#005CA9` as the one accent, navy `#0B2340` and the
yellow `#FFC917` of Bizzy's band. The card starts with the brand as the app
writes it: the logo mark (Bizzy standing still: his blue block with the lid,
the yellow band and his eyes), then BIZZY in thin, spaced, outlined capitals. On screens
960px and wider a panel on the left carries the welcome page's headline and
Bizzy standing on a block of his blue with the yellow band; narrower screens
show the form alone. The panel's text is English, and Dutch when Keycloak marks
the page `lang="nl"` (realm internationalisation on, Dutch selected).

| File | Purpose |
|---|---|
| `login/resources/css/bizzy-login-v2.css` | Brand layer over `caselaw-login-v10.css` |
| `login/resources/fonts/*.woff2` | Inter and Overpass (latin, latin-ext; SIL OFL, licences beside them), served by Keycloak: no Google Fonts |
| `login/resources/img/bizzy-v2.svg` | Bizzy as the app's engine draws him (idle), with a slow bob and blink, still under reduced motion: the left panel |
| `login/resources/img/bizzy-mark-v4.svg` | The logo mark in the card's header (the app's `public/brand/bizzy-mark.svg`) |
| `login/resources/img/bizzy-favicon-v4.svg` | Favicon: the app's own `favicon.svg` (pixel-grid drawing; lighter lid and side in a dark browser theme) |
| `login/messages/messages_{en,nl}.properties` | Tab title and header from the realm's display name (`Sign in to {0}`; set to "Bizzy" on the server), the email step's heading "Sign in to Bizzy"; all other copy comes from `caselaw` |
| `account/resources/css/bizzy-account-v1.css` | Bizzy tokens for the account console |
| `email/html/template.ftl`, `email/text/template.ftl` | The email layout (HTML and plain text), the same markup as the Bizzy app's own emails |
| `email/{html,text}/*.ftl` | The sign-in code (`otp-email`), the sign-in link, required actions, address verification and change, reset, SMTP test |
| `email/messages/messages_{en,nl}.properties` | Every word of the emails, English and Dutch |

Bizzy has no public legal documents, so the theme sets the legal URLs empty
instead of inheriting Case Law Explorer's. A client's own Terms/Policy URLs
still take precedence if they are ever added. The footer's product link
defaults to Bizzy; `BIZZASH_AUTH_FOOTER_*` environment variables override it.

## Emails

The `email` theme gives every email the realm sends one layout: the logo and
BIZZY in the header, a white card, the yellow band, and a footer "Bizzy · Made
at BISS, Maastricht University". The sign-in code is large, monospaced and
spaced, with how long it works (10 minutes: the realm's login-action timeout).
Keycloak passes only the realm and client names to the subject, so the code
cannot be in the subject line; the inbox preview line starts with it instead
("123456 is your code to sign in to Bizzy…"). Emails Bizzy does not word
itself (event notices, identity-provider links) still get the layout around
Keycloak's own text.

Email-client rules: tables, inline styles, no web fonts needed, 600 px wide and
fluid below, dark mode handled, a button that works in Outlook without VML. The
only picture is the 28 px logo, loaded from the Bizzy app
(`https://bizzy.biss-institute.com/brand/bizzy-mark-56.png`); with pictures
blocked the header still reads BIZZY and nothing else is missing. Set
`BIZZASH_EMAIL_LOGO_URL=` (empty) to send no picture at all, which also avoids
classic Outlook's "download pictures" bar for senders not in the reader's safe
list. `BIZZASH_EMAIL_PRODUCT_URL` and `BIZZASH_EMAIL_PRODUCT_HOST` change the
footer link.

The sender name and address are realm settings (**Realm settings → Email**),
not theme settings.

## Selecting the theme

Select `bizzy` for **Login theme**, **Account theme** and **Email theme**
under **Realm settings → Themes** of the `bizzy` realm. `scripts/apply-themes.sh`
(`KEYCLOAK_REALM=bizzy KEYCLOAK_THEME=bizzy`) sets the login and account
themes only; choose the email theme in the console once. After that, deploying
a new image is all a change needs. For the domain, see
[Project authentication domains](../../docs/PROJECT_AUTH_DOMAINS.md).

Theme resources are cached in production: when changing a stylesheet or image,
add a new versioned filename and update `theme.properties`.

`preview.html` is a static visual check of the email step and can be opened
directly in a browser; Keycloak does not load it.
