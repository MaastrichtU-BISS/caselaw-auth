# Project authentication domains on shared Keycloak

**Deployment status:** shared Keycloak custom-domain support is deployed, but
Access per-project issuer support and the Coolify app-bundle mapping changes are
separate, pending rollouts. Check [AUTH_ROLLOUT_STATUS.md](AUTH_ROLLOUT_STATUS.md)
before applying instructions to a live service.

For APIs protected by Access, the forthcoming **Project → Settings → Project
authentication** configuration selects API trust, not the console's administrator
login. The [Access implementation-preview guide](https://github.com/MaastrichtU-BISS/caselaw-access/blob/main/docs/PROJECT_AUTH.md)
explains audiences and identity migration, but its screen/API require the Access
implementation to be released and deployed first. Basic Keycloak login does not
require that feature. Never change the Access console's global issuer just to
accept one project's realm.

Each BISS project can use `auth.<project-domain>` while sharing the existing
Keycloak deployment and database. Each project realm has one canonical frontend
URL and keeps its own users, clients, theme, SMTP and authentication policy.
Custom domains work with password login and with optional email OTP.

DigiMach DNS and its application issuer have not yet been migrated. The
[DigiMach authentication setup](DIGIMACH_HANDOFF.md) lists the existing
configuration and the cutover steps for each responsible team.

## Who does what

| Owner | Action | Access needed |
|---|---|---|
| Domain owner | Point `auth.digimach.eu` to the shared ingress | DNS for `digimach.eu` |
| Deployment operator | Route that HTTPS host to the existing Keycloak service and issue its certificate | Coolify/proxy configuration |
| Realm administrator | Set the `digimach` realm's Frontend URL | Keycloak Admin Console |
| Application/API owners | Set the new issuer in every service using that realm and test it | Application configuration/deployment |

No new Keycloak instance or auth repository checkout is required. Adding a domain
may cause Coolify to redeploy the existing resource when it regenerates routing.
The application may need a restart or rebuild to pick up its new issuer.
Without application configuration access, coordinate this step with its owner
before changing an existing realm's Frontend URL.

## Values to agree before starting

| Setting | DigiMach example |
|---|---|
| Shared Keycloak service | Existing `caselaw-auth` deployment |
| Canonical administration origin | `https://auth.caselawexplorer.tech` |
| Target realm | `digimach` |
| Project authentication origin / realm Frontend URL | `https://auth.digimach.eu` |
| New OIDC issuer | `https://auth.digimach.eu/realms/digimach` |
| Application callback | The application's existing exact callback, e.g. `https://<application-host>/auth/callback` |

The **Frontend URL is the origin**, without `/realms/digimach`. The **issuer
includes `/realms/digimach`**. The callback belongs to the application, not the
authentication host. Domain names below are examples; retain the client's real
application callback and client ID.

One realm has one canonical frontend URL. Every application sharing that realm
uses that issuer. Use separate realms for separate project identities and policies.
Separate realms do not automatically share users or SSO: a BISS-wide account/SSO
service would require a separately designed identity-broker arrangement. An external
identity provider may show its own domain during sign-in.

## 1. Prepare the DNS and HTTPS route

1. Have the DNS owner create or update `auth.digimach.eu` to reach the shared
   Coolify ingress. Use an A/AAAA record for the operator's supplied address, or
   a CNAME to an operator-approved hostname. A CNAME does not change the address
   users see. Remove conflicting records, including stale IPv6 routes. Confirm
   the record's existing use before replacing it; leave the main website records alone.
2. In the **existing Keycloak application's Domains page**, select **Add**,
   choose service **keycloak**, protocol **https**, domain **auth.digimach.eu**,
   and internal port **8080**, then save. Keep the shared domain. Remove an
   automatically added `www.auth.digimach.eu` alias unless it is intentional and
   has its own DNS. Older Coolify versions may instead use a comma-separated field,
   e.g. `https://auth.caselawexplorer.tech:8080,https://auth.digimach.eu:8080`.
   This port selects the container target, not a public `:8080` URL. For DigiMach,
   this route is already prepared; do not add it twice.
3. Apply the routing change and wait for a valid trusted TLS certificate for
   `auth.digimach.eu`. Check both certificate issuance and renewal configuration.
4. Confirm the new domain reaches Keycloak over HTTPS. At this stage its discovery
   document may still advertise the old issuer; the realm change comes next.

Do not configure an HTTP redirect from the project auth domain to the Case Law
domain: both hosts must route to the same backend while preserving the project
host. Do not rewrite HTML, tokens or discovery response bodies in the proxy.

## 2. Keep a fixed shared administration hostname

The auth repository's Compose configuration accepts these deployment variables:

```dotenv
KEYCLOAK_HOSTNAME=https://auth.caselawexplorer.tech
KEYCLOAK_ADMIN_HOSTNAME=https://auth.caselawexplorer.tech
KEYCLOAK_HOSTNAME_STRICT=true
```

`KEYCLOAK_HOSTNAME` is the server-wide fallback. Do not replace it for each new
project. Explicitly set `KEYCLOAK_ADMIN_HOSTNAME` to keep the Admin Console on a
shared origin even when the selected realm has a custom Frontend URL.
The checked-in `.env.example` and shared production deployment explicitly set
both hostnames to the shared HTTPS origin and strict mode to `true`. In contrast,
Compose's fallback when those inputs are omitted is empty hostnames and
`KEYCLOAK_HOSTNAME_STRICT=false`, retained for compatibility/local setups. The
fallback is **not** the recommended project-domain production configuration.
For local Keycloak, replace both example hostnames with the local origin.
Both configured hostnames must be full URLs. The repository maps these to `KC_HOSTNAME` and
`KC_HOSTNAME_ADMIN` inside Keycloak; `KEYCLOAK_HOSTNAME_STRICT` maps to
`KC_HOSTNAME_STRICT`. If these container settings change, redeploy once.

Audit the Coolify variables against the Compose mapping, rather than assuming
every variable saved in the panel reaches the container:

| Coolify setting | Action when adding DigiMach |
|---|---|
| `KEYCLOAK_HOSTNAME` | Keep the existing shared full HTTPS origin |
| `KEYCLOAK_ADMIN_HOSTNAME` | Explicitly set to the shared admin origin before enabling project domains |
| `KEYCLOAK_HOSTNAME_STRICT` | Use `true` with the fixed hostname |
| `KC_PROXY_HEADERS` | Compose already sets `xforwarded`; verify the ingress overwrites those headers |
| `KC_HOSTNAME_BACKCHANNEL_DYNAMIC` | Compose fixes this to `false`; do not enable dynamic endpoints for this design |
| `KEYCLOAK_REALM`, `CASELAW_PASSWORDLESS_AUTO_APPLY`, `CASELAW_PASSWORDLESS_ESTATE_MODE` | Retain the deployment's existing reconciliation target/policy; adding a domain does not retarget it to DigiMach |
| Admin credentials, database credentials | No domain-related change |

If the panel contains `KC_HOSTNAME` or `KC_HOSTNAME_ADMIN` directly, this Compose
file does not read them as inputs; set the `KEYCLOAK_*` inputs shown above. Inspect
only the effective hostname/proxy settings in the running container when debugging;
avoid printing the full environment because it contains credentials.

Compose sets `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=false` so discovery publishes the
project's canonical origin for token, userinfo, keys and logout endpoints too.
Applications and API servers must be able to reach that HTTPS origin.

The proxy must overwrite `X-Forwarded-*` headers, accept only explicitly configured
hosts, and be the only public path to the container. Hostname settings control
generated URLs; they do not restrict which realms or Admin REST endpoints can be
requested on a hostname. Where domain isolation is required, configure proxy rules
to permit the matching `/realms/digimach/` paths and shared `/resources/` paths on
the DigiMach hostname and reject other realms and `/admin/` there. Keep the shared
administration route working. A separate admin hostname alone is not an API access
restriction. Do not expose management/metrics port 9000 publicly.

## 3. Set the realm Frontend URL

In the shared Keycloak Admin Console:

1. Select **digimach** and verify the realm name.
2. Open **Realm settings → General**.
3. Record the previous **Frontend URL**, including whether it was empty.
4. Set **Frontend URL** to `https://auth.digimach.eu` and save.

This writes the realm attribute `frontendUrl`. It overrides the global hostname
for that realm. It does not create clients, enable OTP, change SMTP credentials,
rename users or select a theme. Existing `digimach` theme and OTP settings remain
in use. Do not change the `master` or `caselaw` realm to the DigiMach URL.

An administrator can do this entirely in the console. No custom-domain installer
script is required. The separate [OTP installer](OTP_SETUP.md) is still required
only when enabling that authentication policy in a realm that does not yet use it.

## 4. Update every connected application's issuer

For a Node server using `caselaw-auth/server`, or Python using
`caselaw-auth-server`, change the value passed as `issuer`:

```dotenv
AUTH_ISSUER=https://auth.digimach.eu/realms/digimach
```

For a static browser app using `caselaw-auth/client`, `/vue` or `/svelte`:

```dotenv
PUBLIC_AUTH_ISSUER=https://auth.digimach.eu/realms/digimach
```

These are the guide's conventional variable names. Set the variable the actual
application reads: changing an unused variable has no effect. Keep the existing
client ID, exact application callback, client secret (if confidential), and session
configuration. A static app often needs a rebuild; a server often needs a restart.
Both integrations discover the new endpoints automatically. No new OTP code or
package version is required merely to use a different issuer.

Also update each API/JWT validator and any manually configured discovery, JWKS,
logout or account links that reference this realm's old host. External IdP broker
callbacks and third-party allowlists may need the new auth hostname registered.
Application callbacks and web origins normally remain the same because the
application itself has not moved. Do not add the auth domain as an application
callback as a substitute for the application's real route.

Read the [server integration](SERVER_SIDE_AUTH.md) or
[browser integration](CONNECTING_PROJECTS.md) for callback, session and logout code.

## 5. Verify the domain and the complete journey

Before migrating an existing realm, verify the prepared route and trusted TLS
without changing its active issuer. Keep local multi-domain regression coverage
(`npm run test:e2e`); no persistent public test domain is required. Complete the
real application journey during the coordinated cutover below.

Inspect discovery without administrator credentials:

```bash
curl --fail --silent --show-error \
  https://auth.digimach.eu/realms/digimach/.well-known/openid-configuration
```

The `issuer` must exactly match `https://auth.digimach.eu/realms/digimach`.
Authorization, token, userinfo, JWKS, logout, introspection and revocation URLs
must all use `auth.digimach.eu` and the `digimach` realm.

The repository also supplies a **read-only** checker:

```bash
node scripts/check-realm-domain.mjs https://auth.digimach.eu/realms/digimach
```

Without a checkout, download and inspect the checker before executing it:

```bash
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/MaastrichtU-BISS/caselaw-auth/main/scripts/check-realm-domain.mjs \
  --output check-realm-domain.mjs
# Inspect check-realm-domain.mjs in your editor. For repeatable automation,
# replace main in the download URL with the reviewed commit SHA.
node check-realm-domain.mjs https://auth.digimach.eu/realms/digimach
```

Use Node 18+. The checker uses no packages
or admin credentials. It checks discovery, canonical endpoint origins, PKCE, keys
and the account page; it does not send an email or prove a complete login.

Then test through the actual application's login button in a private browser:

- The initial redirect uses the new project host and correct realm/client.
- Email entry, OTP, resend, error pages and theme resources stay on that host.
- A new email can complete registration and return to the application callback.
- The application's normal token verification accepts the new issuer; API access
  and role checks succeed with it. Do not disable issuer validation to make it work.
- Email OTP completes without a magic-link option. Test recovery/verification
  emails separately for whichever other flows the realm enables.
- Token refresh succeeds; logout clears the application session and Keycloak SSO.
- Account Management and a second application in the same realm use the same host.
- Shared Admin Console access and the Case Law realm still work at their own URLs.

Use browser network inspection as well as the address bar to detect hidden asset
or request hops to the old host. The final application callback naturally returns
to the application's domain. Branded footer links or external identity providers
may intentionally point elsewhere.

## Migrating an existing realm

Treat the switch as an issuer migration. Coordinate step 3 with deployment of all
affected applications/APIs in step 4 in a maintenance window. Verify prepared
routing before the switch and use the disposable local multi-domain regression
for repeatable tests. Do not change a live realm's issuer merely to test routing.

The new hostname changes the token `iss` claim. Existing tokens carry the old issuer
and old browser SSO cookies belong to the old host. Plan a fresh login for users,
clear/invalidate application sessions according to each application's mechanism,
and let old in-flight login attempts and email action links expire before testing.
Do not assume moving DNS preserves browser sessions or makes old links work.

Users remain in the same realm, but applications that key identities by `(iss, sub)`
will see a changed identity namespace even if `sub` is unchanged. Their owners must
map existing accounts/data to the new issuer before rollout to avoid duplicate
accounts or lost access. Review pending invitations, stored provider identifiers,
background jobs and machine clients using this realm as well.

Rollback requires restoring **both** the recorded realm Frontend URL and the old
issuer configuration in every affected application/API, followed by fresh login.
Retain the new DNS route/certificate long enough to handle already issued links
and diagnose failures. Restoring the realm field alone is not a complete rollback.

## Troubleshooting

| Symptom | Check |
|---|---|
| Vercel `DEPLOYMENT_NOT_FOUND` | The auth subdomain still routes to Vercel; check DNS and the intended ingress |
| Certificate error | TLS is not commissioned for the project host; fix issuance instead of bypassing validation |
| Redirects or discovery use Case Law | Wrong/missing realm Frontend URL, wrong requested realm, or an app still using its old issuer |
| Login works but callback/API fails | Issuer mismatch, cached discovery, old sessions, changed identity namespace, or client/callback mismatch |
| 403 during form submission | Proxy origin/forwarded-header configuration |
| Admin Console jumps between domains | Missing fixed `KEYCLOAK_ADMIN_HOSTNAME` or stale admin browser session |
| Another realm appears on the project domain | Realm Frontend URL is not host-based access control; inspect proxy host/path restrictions |

## References and test scope

- [Keycloak hostname configuration](https://www.keycloak.org/server/hostname)
- [Keycloak 26.7 hostname provider: realm frontend URL precedence](https://github.com/keycloak/keycloak/blob/26.7.0/services/src/main/java/org/keycloak/url/HostnameV2Provider.java)
- [Keycloak reverse proxy requirements](https://www.keycloak.org/server/reverseproxy)
- [Coolify domains and TLS](https://coolify.io/docs/knowledge-base/domains)
- [OIDC issuer matching](https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfig)

The local multi-domain regression uses one Keycloak instance, two temporary realms
and two loopback proxy origins with a fixed shared administration URL. It checks
discovery, both themes' resources, OTP-only login and rejection of magic-link selection,
token issuer, refresh, logout, account URLs, forwarding-header overwrite, rollback
and preservation of the existing realm. Public DNS, trusted TLS, real browser cookie
behavior and the actual project callback still require the commissioning checks above.
