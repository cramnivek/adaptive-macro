# Per-user access to the AI proxy

Design, 2026-10-12. Drafted overnight without the owner, so every decision below
marked **(decided overnight)** is a proposal to confirm or overturn.

## Problem

Every copy of the app carries the same `EXPO_PUBLIC_PROXY_TOKEN`, inlined into the
bundle at build time. Anyone who opens the web app's JavaScript has it. The proxy
(`services/gemini-proxy`) can't tell callers apart, so its limits are a guess:

- per caller: 20 Gemini calls per 10 minutes, keyed on an address the caller
  can partly spoof (`rateLimit.ts`, `router.ts`);
- for everyone together: a flat 300 Gemini calls a day (`GEMINI_DAILY_CEILING`).

The flat ceiling is what keeps the bill bounded, and it is also what makes the
app unshippable. One person with the token can spend the day's 300 calls, after
which photo estimates, routine building and AI lookups fail for every user. This
was blocker #1 on the store-readiness list.

Accounts now exist (Supabase, step 1 of social). A signed-in person carries a
JWT the proxy can verify, which names them. That is the missing piece.

## Goal

The proxy knows who is calling and limits each person separately, so one person
can't spend everyone's budget. The shared token stops being something worth
stealing.

## Non-goals

- **Payments or tiers.** One allowance for everyone.
- **Removing signed-out AI use on day one.** See *Transition*.
- **Moving the food lookups (Open Food Facts, USDA) behind sign-in.** They are
  cheap and already limited per caller; only Gemini costs money.
- **Persisting usage across proxy instances.** See *Where the counts live*.

## Design

### The app sends the user's token

When signed in, every proxy request also carries `Authorization: Bearer <access
token>` from `supabase.auth.getSession()`. The token is short-lived (an hour) and
supabase-js refreshes it, so nothing new is stored. Gemini requests are built in
`routeFor` (`mobile/src/api/gemini.ts`), the only route that needs it. The Open
Food Facts and USDA clients add the shared token separately and stay as they are.
`routeFor` is synchronous today, and the session read is async, so it becomes
async, or takes the token as an argument from its callers.

### The proxy verifies it

The proxy verifies the JWT against the project's published keys
(`https://eigtmrtavtpzzjzfcskc.supabase.co/auth/v1/.well-known/jwks.json`) using
Node's built-in WebCrypto (`crypto.subtle`, ECDSA P-256). That keeps the proxy
free of runtime dependencies, as it is today. It caches the keys and checks the signature,
`exp`, `iss` (the project's auth URL) and `aud` (`authenticated`). The user id is
the token's `sub`.

- **Checked 2026-10-12:** the project publishes asymmetric signing keys. The
  JWKS endpoint returns one ES256 (P-256) key, so verification needs no secret on
  the proxy: just the public JWKS URL, with `algorithms: ['ES256']`.

### Limits per person

**(decided overnight)**
- **Signed in:** 60 Gemini calls per person per day, plus the existing
  20-per-10-minutes burst limit, keyed on `sub` instead of the address. A heavy
  real day is perhaps 15: photo estimates, a routine build, a few lookups.
- **The global ceiling** rises from 300 to 1,500 a day and stays in place as a
  bill guard, not as the everyday limit.
- **Signed out (shared token only):** a separate pool of 100 a day across all
  signed-out callers. That keeps today's testers working without an account while
  the app moves over.

Each of these is one constant in `router.ts`.

### Where the counts live

The counts stay in memory per instance, as they are today. Cloud Run can run more
than one instance, so a person could in theory get 60 × instances a day. With
`max-instances` set to 1 or 2 for this service, that is acceptable and costs
nothing. A shared store (Firestore, Redis, or a Supabase table written with the
service key) is the upgrade if the app grows. It would be a change inside
`createRateLimiter`, invisible to callers.

### What the person sees

When their own daily allowance runs out, the app says "You've used today's AI
allowance. It resets tomorrow." instead of the generic "too many requests". The
proxy distinguishes the cases with a header (`x-limit: user-daily`), and
`describeHttpFailure`-style mapping in the app reads it.

### Transition

1. **Release A:** the app sends the bearer token when signed in. The proxy accepts
   either the shared token alone (signed-out pool) or the shared token plus a
   valid JWT (per-user limits). Nothing breaks for anyone.
2. **Release B, after testers have accounts:** AI features ask a signed-out person
   to sign in ("Sign in to use AI features — it's free"). The shared token is
   then accepted only for the food lookups.
3. Optionally, rotate `PROXY_TOKEN` at B, so copies taken from old bundles stop
   working.

### Errors

- An expired JWT gives 401 with `x-auth: expired`. The app refreshes the session
  once and retries.
- An invalid signature gives 401 and is never retried.
- An unreachable JWKS endpoint: the cached keys keep working. On a cold start
  with no cache, signed-in requests fall back to the signed-out pool rather than
  failing.

## Testing

- **Proxy, vitest:** sign test JWTs with a local key pair, serve it as a JWKS from
  a stub, and check:
  - valid → per-user limit;
  - expired, wrong `aud` or wrong `iss` → 401;
  - no JWT → signed-out pool;
  - two users don't share a count;
  - the global ceiling still binds.
- **App:** the request builder attaches the header only when a session exists
  (pure function test).
- **End to end:** signed in, then signed out, against a deployed proxy. Run
  the 61st call in a day by temporarily lowering the constant in a test
  deploy.

## Costs and risks

- **No new dependency:** verification uses Node's WebCrypto. No new services and
  no new secrets. One new setting on the proxy, `SUPABASE_URL`. Without it,
  per-user limits are off and everyone uses the signed-out pool.
- **A wrong `iss`/`aud` check would lock everyone out of per-user limits.** The
  fallback keeps them on the signed-out pool, and the tests pin both values.
