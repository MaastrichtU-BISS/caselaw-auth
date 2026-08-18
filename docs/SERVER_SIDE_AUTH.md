# Server-side sign-in

For products where the browser client is the wrong tool: server-rendered apps
(Astro, SvelteKit with an adapter, Nuxt with a server, Express) and anything
holding a shared secret.

The worked example is **DiscourseConnect**, because it is the case that forces
the issue.

---

## When you need this

Reach for `caselaw-auth/client` (or `/vue`, `/svelte`) for a browser app that
talks to an API with a bearer token. It is the right tool and most products
here use it.

Reach for `caselaw-auth/server` when any of these is true:

- **You hold a shared secret.** DiscourseConnect signs its payload with one. A
  browser cannot keep a secret, so this is not a preference — a browser
  implementation is impossible, because anyone with the secret can mint a
  payload asserting any email, including an admin's.
- **The page is rendered on the server.** There is no `window` to put a session
  in, and the browser client will throw: `login()` and `handleCallback()` both
  call `assertBrowser()`.
- **You want the session out of reach of page script.** An httpOnly cookie
  cannot be read by JavaScript; `localStorage` can. See
  [the note on that trade](#why-not-just-use-the-browser-client).

The two can coexist. A product may render server-side and still hand a
short-lived token to a browser widget.

---

## The flow

Three routes. Names are conventional, not required.

```
GET /auth/login      →  redirect to Keycloak
GET /auth/callback   →  exchange the code, set the session cookie
GET /auth/logout     →  clear the cookie, redirect to end_session
```

```ts
import { createServerAuth, createPkcePair, randomToken } from "caselaw-auth/server";

export const auth = createServerAuth({
  issuer: process.env.AUTH_ISSUER!,                    // .../realms/caselaw
  clientId: process.env.AUTH_CLIENT_ID!,
  clientSecret: process.env.AUTH_CLIENT_SECRET,        // confidential clients
  redirectUri: process.env.AUTH_REDIRECT_URI!,
  sessionSecret: process.env.AUTH_SESSION_SECRET!,     // long, random, not shared
});
```

### `/auth/login`

```ts
const { verifier, challenge } = await createPkcePair();
const state = randomToken();

// state and verifier must survive the round trip, and must not be readable by
// page script. A short httpOnly cookie is the simplest place.
setCookie("auth_tx", await auth.sealSession({
  user: { id: "pending", email: null, name: null },
  roles: [], expiresAt: Math.floor(Date.now() / 1000) + 600,
  state, verifier, returnTo: url.searchParams.get("returnTo") ?? "/",
}, "auth_tx"), auth.cookieOptions(600));

return redirect(await auth.authorizationUrl({ state, codeChallenge: challenge }));
```

PKCE even with a client secret: the realm's clients require `S256`, and it
keeps the flow safe if the secret ever leaks.

### `/auth/callback`

```ts
const tx = await auth.unsealSession(getCookie("auth_tx"));
if (!tx || tx.state !== url.searchParams.get("state")) {
  return new Response("Bad state", { status: 400 });   // CSRF, or an expired attempt
}

const tokens = await auth.exchangeCode({
  code: url.searchParams.get("code")!,
  codeVerifier: tx.verifier as string,
});

const claims = await auth.verifyToken(tokens.access_token, { azp: process.env.AUTH_CLIENT_ID });
const session = auth.sessionFromClaims(claims, { idToken: tokens.id_token });

setCookie("caselaw_session", await auth.sealSession(session), auth.cookieOptions(8 * 3600));
clearCookie("auth_tx");
return redirect(String(tx.returnTo ?? "/"));
```

**Always verify the token you just received.** It arrived over TLS from the
token endpoint, so this is belt and braces — but `verifyToken` is also what
pins the issuer, and the same call is what you will reuse on every request.

`sessionFromClaims` deliberately does **not** keep the access token. See below.

### `/auth/logout`

```ts
const session = await auth.unsealSession(getCookie("caselaw_session"));
clearCookie("caselaw_session");
return redirect(await auth.endSessionUrl({
  idToken: session?.idToken as string | undefined,
  returnTo: site,
}));
```

Passing `id_token_hint` is what makes this a real single sign-out. Without it
Keycloak keeps its own session and the next sign-in completes with no prompt,
which reads as the sign-out having silently failed.

### Reading the session on a page

```ts
const session = await auth.unsealSession(getCookie("caselaw_session"));
if (!session) return redirect(`/auth/login?returnTo=${encodeURIComponent(url.pathname)}`);
if (!session.roles.includes("admin")) return new Response("Forbidden", { status: 403 });
```

Cheap — an HMAC check, no network call.

---

## Keycloak client

A fifth shape alongside the four in the realm: it signs users in **and** holds a
secret.

| Setting | Value |
|---|---|
| Client authentication | **On** — this is a server |
| Standard flow | **On** |
| Direct access grants | Off |
| Service accounts | Off, unless you also need machine tokens |
| Valid redirect URIs | `https://your-host/auth/callback` |
| Valid post logout redirect URIs | `+` |
| PKCE method | `S256` |

Copy the secret from **Credentials** into `AUTH_CLIENT_SECRET`. Never a
`PUBLIC_` variable — that prefix is exactly the convention that would ship it
to the browser.

---

## Decisions this module makes for you

Each of these was arrived at the hard way in `sql-runner-ui`, which is the
implementation this was extracted from.

**The access token is not stored.** `sessionFromClaims` copies the roles out and
drops it. It bloated the cookie past the browser's limit and bought nothing,
because nothing downstream read it. Keep one only if something genuinely calls
an API as the user — and know that a token in a cookie leaks with the cookie.

**The session has its own TTL,** eight hours by default, rather than the access
token's few minutes. Reading expiry off a token makes session length hostage to
clock drift between two machines.

**`sealSession` throws above 4096 bytes.** Browsers drop a larger cookie
silently, which presents as the app signing the user straight back out — it
looks like broken auth rather than an oversized session.

**Cookies are `httpOnly`, `secure`, `sameSite=lax`.** Not `strict`: that would
drop the cookie on the top-level redirect back from Keycloak, leaving the user
signed in everywhere except the page they just landed on.

**`verifyToken` does not check `aud` by default.** Keycloak does not put the
client id there for a public client's access token — it puts `account`, and
names the client in `azp`. Checking `aud` rejects every valid token, which
reads as the tokens being broken. Pass `azp` instead.

**JWKS is cached for five minutes and retried once.** A blip on the refetch
would otherwise fail a request with nothing wrong with it; the access service
learned that by turning a filled-in form into a bare 503.

---

## DiscourseConnect

Discourse redirects to your endpoint with `sso` (base64 of a query string) and
`sig` (HMAC-SHA256 of `sso`, using the shared secret). You verify it,
authenticate the user, then send back a payload signed the same way.

```ts
import crypto from "node:crypto";

const SECRET = process.env.DISCOURSE_CONNECT_SECRET!;
const sign = (payload: string) =>
  crypto.createHmac("sha256", SECRET).update(payload).digest("hex");

// GET /discourse/sso
const sso = url.searchParams.get("sso")!;
const sig = url.searchParams.get("sig")!;

// Constant-time, and length-checked first — timingSafeEqual throws on a mismatch.
const expected = sign(sso);
if (sig.length !== expected.length
  || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  return new Response("Bad signature", { status: 400 });
}

const session = await auth.unsealSession(getCookie("caselaw_session"));
if (!session) {
  return redirect(`/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
}

const nonce = new URLSearchParams(Buffer.from(sso, "base64").toString()).get("nonce")!;

const payload = Buffer.from(new URLSearchParams({
  nonce,
  external_id: session.user.id,        // Keycloak's `sub` — see below
  email: session.user.email ?? "",
  name: session.user.name ?? "",
}).toString()).toString("base64");

return redirect(`${DISCOURSE_URL}/session/sso_login?`
  + new URLSearchParams({ sso: payload, sig: sign(payload) }));
```

Four things to get right:

**`external_id` must be Keycloak's `sub`, never the email.** It is the identity
Discourse keys its account on. Emails change, and get reassigned; keying on one
means the next person to hold an address inherits the account.

**Echo the `nonce` back exactly, once.** It is what ties your response to
Discourse's request and stops a captured payload being replayed.

**Compare signatures in constant time.** `===` on a hex digest leaks it a byte
at a time to anyone who can measure.

**The secret is server-only.** Same value in Discourse's admin settings and in
your environment, and nowhere else.

The realm sets `verifyEmail: true`, which is what Discourse wants. If that is
ever relaxed, add `require_activation=true` to the payload so Discourse
confirms the address itself.

---

## Worked example: the research workspace

`MaastrichtU-BISS/citations` was migrated from the browser client to this one,
and it is worth reading because it hit the two problems a real migration hits.

**The session is two cookies, not one.** `caselaw_session` holds the identity,
roles and id token; `caselaw_at` holds the access token. Together they do not
reliably fit under 4096 bytes, and an oversized cookie is discarded silently,
which presents as the app signing you straight back out.

**Something still needs the user's token.** That app proxies every `/api/*` call
server-side, and the citations API distinguishes a request made by a person from
one made by the deployment — saved queries need an owner. The browser used to
answer that by attaching its own token, which is precisely what made the token
readable. Now it sets a marker header, `x-caselaw-as-user`, and the proxy reads
the token from the cookie:

```ts
reqHeaders.delete('authorization');
let credential = apiToken;                       // this deployment
if (request.headers.get(AS_USER_HEADER)) {
  const held = await auth.unsealSession(cookies.get(ACCESS_COOKIE));
  if (held?.accessToken) credential = String(held.accessToken);   // this person
}
reqHeaders.set('authorization', `Bearer ${credential}`);
```

The marker is not a security boundary — any script can set it. It only chooses
between two credentials the server already holds, and the worst case is a corpus
read arriving as the signed-in user, which they could have made anyway. That is
a much smaller surface than handing the browser a token.

**What the move deleted:** a "checking session" screen, a reactive redirect, and
a second render of every protected page. All three existed only because the
browser held the session and had to resolve it after mount. The server knows
before anything renders, so an unauthorised visitor is redirected before a byte
of HTML is produced.

## Why not just use the browser client

The browser client keeps the whole session — **including the refresh token** —
in `localStorage`, where any script running on the page can read it. That is
the standard public-SPA trade and it is a reasonable one, but it is strictly
weaker than a cookie script cannot touch.

For a server-rendered app there is no reason to take that trade: the session
never needs to be in the browser at all, only a cookie handle to it. And for
anything holding a secret the question does not arise, because the browser
cannot hold one.

If you are weighing this for an existing browser app, the mitigation that
matters most is not moving to cookies — it is not having an XSS. A
Content-Security-Policy and no unescaped HTML sinks buy more than any storage
choice, because script running on your origin can drive an httpOnly session
just as well by simply making requests with it.
