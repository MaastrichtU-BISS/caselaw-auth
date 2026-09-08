# DigiMach authentication: prepared setup and cutover

Deployment handoff, 8 September 2026. This is the actual DigiMach configuration,
not a template for creating another realm. The application and DNS are owned by
the DigiMach team; BISS operates the shared Keycloak deployment.
For the separate pending Access and Coolify app-bundle releases, see
[Authentication rollout status](AUTH_ROLLOUT_STATUS.md).

## Already configured by BISS

| Setting | Current value / state |
|---|---|
| Keycloak instance / Admin Console | `https://auth.caselawexplorer.tech` |
| Realm | `digimach` (existing users retained) |
| Current issuer — keep using until coordinated cutover | `https://auth.caselawexplorer.tech/realms/digimach` |
| Prepared future auth origin | `https://auth.digimach.eu`, routed in Coolify to the existing Keycloak service, internal port `8080` |
| Future issuer — do not activate before DNS and TLS work | `https://auth.digimach.eu/realms/digimach` |
| Realm Frontend URL | Empty, deliberately retaining the current issuer |
| Login policy | Email-only registration and six-digit email OTP; no required names/password; magic-link sign-in disabled |
| Branding | `digimach` login and account themes; DigiMach login favicon and responsive footer |
| Email sender — confirmed by project owner | `no-reply@digimach.eu`; existing realm SMTP configuration retained |
| Existing application client | `digimach-frontend` |
| Client type / flow | Confidential (server-side secret), Authorization Code with PKCE S256; direct password grants disabled |
| Development callback allowlist — retained | `http://localhost:4321/*` |
| Current Web Origins | `+` (origins derived from allowed redirects) |

The future domain route is prepared, **not commissioned**. DNS still points to
Vercel. A valid certificate and end-to-end login on that hostname cannot be
confirmed until the DNS owner points it to BISS. No separate auth deployment is
needed. The app's production callback and logout URLs have not been supplied, so
they have not been guessed or allowlisted.

The shared hostname/admin hostname stay at `https://auth.caselawexplorer.tech`;
`KEYCLOAK_HOSTNAME_STRICT=true` remains set. These values are mirrored in
`.env.example` and the operator's ignored `.env.local`. Project routes belong to
Coolify's **Domains** configuration; do not change global hostname variables to
DigiMach or invent a per-project environment variable that Compose does not read.

## 1. DigiMach DNS owner: prepare the auth hostname

1. In the `digimach.eu` DNS zone, point the **`auth` A record** to **`46.224.219.58`**.
2. Replace any Vercel record for this exact hostname and remove conflicting
   CNAME/AAAA records. Do not change the apex, `www`, mail records or other services.
3. If Cloudflare is used, start with **DNS only** while BISS verifies TLS.
4. Tell BISS once the record resolves to the new address. BISS will check ingress
   routing, certificate issuance/renewal and the shared service. If certificate
   issuance previously ran before DNS was ready, BISS may need to retrigger it.

No `www.auth.digimach.eu` alias is needed. The public URL has no `:8080` port.
DNS alone does not switch the realm issuer; current development login continues
to use the shared URL until step 4.

## 2. Retain the existing email configuration

The correct sender is **`no-reply@digimach.eu`**, confirmed by the project owner
and matching the realm's saved From address. SMTP is already configured; **no
sender, SMTP-password or mail-DNS change is required for the auth-domain move**.
The existing transport is `live.smtp.mailtrap.io`, port `587`, authenticated,
STARTTLS enabled, implicit SSL disabled. Leave those credentials in Keycloak.

Include actual OTP receipt in the cutover acceptance test. If using Keycloak's
**Test connection**, the signed-in administrator must have an email address.
The BISS bootstrap admin currently has none, so its test request cannot establish
delivery; this is not evidence that the saved SMTP credential is invalid.
The auth hostname and email From domain are independent: moving login to
`auth.digimach.eu` does not require a `login.digimach.eu` mail subdomain.

## 3. DigiMach developer: supply exact application URLs and prepare config

Send BISS the production application URL, exact login callback URL(s), and exact
post-logout return URL(s). Also list any other apps, APIs, workers or identity
providers using the `digimach` realm. BISS will add the approved HTTPS callback
and logout allowlists **alongside** the existing localhost callbacks.

Keep development callbacks enabled. The existing `http://localhost:4321/*` entry
does not also cover `127.0.0.1`, another port or HTTPS localhost; request those
separately if the development app actually uses them. Auth URLs are not application
callbacks: do not add `https://auth.digimach.eu/*` as a substitute.

For the current confidential client, keep its secret **server-side**. Obtain it
through Keycloak's client Credentials tab or an approved secret-sharing channel;
do not rotate it or change the client to public simply for this domain migration.
If the application is browser-only, tell BISS: it needs a separately scoped public
PKCE client, not the confidential client's secret in JavaScript.

Prepare, but do not deploy early, the new issuer value:

```dotenv
AUTH_ISSUER=https://auth.digimach.eu/realms/digimach
AUTH_CLIENT_ID=digimach-frontend
```

These names are illustrative: update the variables the actual project reads.
Keep the real callback, client secret and session configuration. Mirror changes
in the project's deployment configuration, ignored `.env.local` and `.env.example`
(examples must never contain secrets). Browser/build-time config needs a rebuild;
server/runtime config usually needs a restart. Update every API's exact issuer
validation and any hardcoded discovery/JWKS/account/logout URL as well.

Both `caselaw-auth/server` and `caselaw-auth/client` discover endpoints from their
configured issuer. OTP itself is handled by Keycloak; no custom OTP form or new
application OTP code is needed. The realm's OTP installer has already been run.
See [server integration](SERVER_SIDE_AUTH.md) and [browser integration](CONNECTING_PROJECTS.md).

If APIs need a new audience or the project uses caselaw-access authorization,
agree those values with BISS separately. Do not assume an example `digimach-api`
audience or an Access project has already been created/configured. The Access
per-project issuer feature is a separate rollout, not a prerequisite for basic
Keycloak login.

## 4. Coordinated cutover — only after DNS, TLS, mail and app config are ready

1. Agree a switch time with BISS. Everyone using this realm, including local
   development, must switch issuer together. Keep issuer validation enabled.
2. BISS sets **digimach → Realm settings → General → Frontend URL** to
   **`https://auth.digimach.eu`** (origin only, no `/realms/digimach`). The previous
   value is empty. Do not change `caselaw`, `master` or the global hostname.
3. The developer deploys the prepared issuer configuration to the app and every
   API/service using this realm; refreshes cached discovery; and updates local dev.
   Existing users stay in the same realm. Plan a fresh login: old cookies/tokens
   use the old hostname/issuer. If application identities are keyed by `(iss, sub)`,
   migrate that mapping so users retain their application data and permissions.
4. Verify discovery reports the new exact issuer and endpoints, then test the real
   login button: email-only registration, OTP receipt, six-digit entry, resend,
   application callback, API permissions, refresh, logout and subsequent login.
   Verify production **and localhost** callbacks; branding/favicon should remain
   DigiMach throughout the Keycloak pages. The callback returns to the application.
5. Recheck Case Law sign-in and the shared Admin Console. Keep the shared service
   and Case Law URLs unchanged.

If the coordinated cutover fails, restore the realm's Frontend URL to empty and
restore the old issuer in all affected applications, followed by fresh login.
Keep the prepared DNS route/certificate while diagnosing; never disable token
signature, issuer or audience checks to make the migration pass.

Full infrastructure reference: [PROJECT_AUTH_DOMAINS.md](PROJECT_AUTH_DOMAINS.md).
