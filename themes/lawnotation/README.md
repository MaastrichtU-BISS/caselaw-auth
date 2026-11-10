# Lawnotation Keycloak theme

This theme gives the `lawnotation` realm the same authentication-state coverage
as the `caselaw` theme without duplicating it. Both theme types inherit the
Case Law implementation and load a Lawnotation brand layer after the shared
stylesheet. That includes registration, passwords, recovery, errors, identity
switching, social/authenticator choices, responsive behavior, the six-slot
email OTP experience, and the account console.

The realm (issuer `https://auth.biss-institute.com/realms/lawnotation`) serves
two products: [Lawnotation](https://www.lawnotation.org/) and Baigle. Theme
selection is realm-wide, so the look is Lawnotation's while the copy stays
product-neutral ("Sign in to your account"). There is no email theme yet; the
realm has no SMTP configured.

The colors, mark and typeface come from Lawnotation itself
(`lawnotation-ui/tailwind.config.js`, `lawnotation-ui/public/lawnotation-logo.svg`
and [lawnotation.org](https://www.lawnotation.org/)):

- primary blue `#0d5984`, hover `#0b4b6f`
- highlighter block `#b6cdda` (the primary at 30%, as behind the wordmark)
- pale secondary surface `#e9f0f4`
- headings in Roboto Slab, served from this theme
  (`login/resources/fonts`, Apache License 2.0)

`lawnotation-logo-v1.svg` is the wordmark from `lawnotation-ui`. The favicon,
`lawnotation-mark-v1.svg`, is the wordmark's slab "L" on the tilted highlighter
block, matching the favicon of lawnotation.org.

## Legal links and footer

The footer links to Lawnotation's
[terms of service](https://app.lawnotation.org/terms-of-service) and
[privacy policy](https://app.lawnotation.org/privacy-policy), Lawnotation's
site, and BISS Institute. They are set explicitly so the Case Law Explorer
documents are never inherited. Baigle shows its own documents by filling in
**Terms of service URL** and **Policy URL** on its client (Clients → _client_ →
Settings → Login settings), which take precedence over the theme default.

| Variable | Default |
|---|---|
| `LAWNOTATION_AUTH_TERMS_URL` | `https://app.lawnotation.org/terms-of-service` |
| `LAWNOTATION_AUTH_PRIVACY_URL` | `https://app.lawnotation.org/privacy-policy` |
| `LAWNOTATION_AUTH_COOKIES_URL` | empty (no separate cookie policy) |
| `LAWNOTATION_AUTH_FOOTER_MANAGED_BY` | `Authentication managed by BISS Institute` |
| `LAWNOTATION_AUTH_FOOTER_PRODUCT_LABEL` / `_URL` | `Lawnotation` / `https://www.lawnotation.org/` |
| `LAWNOTATION_AUTH_FOOTER_BISS_LABEL` / `_URL` | `BISS Institute` / the BISS page at maastrichtuniversity.nl |

## Selecting the theme

The Docker image already copies the complete `themes/` directory, so a build
from this repository exposes `lawnotation` in Keycloak's theme selectors.
Deploy the image first, then for the **lawnotation realm** select `lawnotation`
for both **Login theme** and **Account theme** under **Realm settings →
Themes**, or run the script against the admin origin:

```sh
KEYCLOAK_URL=https://auth.caselawexplorer.tech \
KEYCLOAK_REALM=lawnotation \
KEYCLOAK_THEME=lawnotation \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=... \
./scripts/apply-themes.sh
```

For local development, run `docker compose -f compose.local.yml up`, which
mounts `themes/` and disables theme caching.

Theme resources are cached in production. When changing a Lawnotation
stylesheet or image, add a new versioned filename and update its
`theme.properties` entry.

`preview.html` is a static visual check for the login theme and can be opened
directly in a browser; it is not loaded by Keycloak in production.
