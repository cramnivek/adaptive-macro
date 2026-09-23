# Hosted Gemini proxy

Design, 2026-09-23.

## Problem

The standalone build asks for API keys before it does anything useful. Food
lookup needs a Gemini key typed into Settings; describing a meal needs either an
Anthropic key or a reachable Ollama server, and the Ollama default is broken
outside Expo Go because `defaultOllamaHost()` has no dev server to read a LAN
address from and falls back to loopback — which, on a phone, is the phone.

So a fresh install lands on a provider that cannot work, and the alternatives
both demand credentials. That is the adoption barrier for anyone who is not the
author, and it is already friction for the author.

## Goals

A fresh install should be able to look up a food and describe a meal with no
configuration.

## Non-goals

- **Removing bring-your-own-key.** It stays, and takes precedence. See
  Fallback below.
- **Proxying Anthropic or Ollama.** Only Gemini moves behind the proxy. The
  other two providers are unchanged.
- **Accounts, sign-in, or per-user identity.** The proxy is anonymous.
- **Play Integrity attestation.** The correct production answer, and premature
  for an app with one user. Recorded in Limitations.

## Shape

One API route, `mobile/app/api/gemini+api.ts`, deployed to EAS Hosting, whose
free tier (100,000 requests, 1 GB storage per month) is far above what this
needs.

It is a **thin passthrough**: the app sends the Gemini request body it would
otherwise have sent to Google, and the proxy attaches the key from a
server-side environment variable and forwards it.

That variable must be created with EAS's **sensitive** type, not **secret**.
Secret-type variables cannot be deployed to EAS Hosting at all — they are
build-time only — so a key stored as a secret would fail at `eas deploy` rather
than at runtime. Sensitive is masked in the dashboard and in logs and is
readable by the deployed route through `process.env`.

This is deliberate. The two-call orchestration, the grounding gate, the `found`
check and the zero-macro floor in `mobile/src/api/gemini.ts` are tested and
were expensive to get right — several of them exist because a specific
fabrication hole was found and closed. Moving them server-side would duplicate
that logic and leave the tests pointing at the copy that no longer runs. The
proxy stays dumb; the app keeps the judgment.

**The model is allowlisted server-side.** A passthrough is otherwise a free
LLM for anyone holding the shared secret, and an allowlist is the difference
between them burning the quota on cheap calls and burning it on expensive ones.
The path is restricted to `:generateContent`.

The app finds the proxy through `EXPO_PUBLIC_API_BASE`, set per environment —
the deployed hosting URL for release builds, the local dev server otherwise, so
the route can be exercised without deploying.

## Authentication and spend

Two layers, neither airtight, and the second is the one that matters.

**A shared secret**, sent by the app as a header and checked by the proxy. It
is named `EXPO_PUBLIC_PROXY_TOKEN` because `EXPO_PUBLIC_` is inlined into the
bundle and therefore extractable — the name states the weakness rather than
hiding it. What it buys is that the URL alone is not enough, and that it can be
rotated without users touching anything.

**A hard quota cap** on `generativelanguage.googleapis.com` in Google Cloud,
requests per day, set in the console.

Spend is in fact already bounded, and more tightly than the cap would bound it:
the billing account is on Prepay with auto-reload off, and at a $0 balance
every key on the account returns HTTP 402 and stops. The exposure is the
credit balance, not the tier cap.

The quota cap therefore protects availability rather than spend. Credit
exhaustion fails silently, with no warning, and takes down every project on the
billing account at once — including the author's own use. A per-day cap stops
the proxy before the balance is gone, which is the outcome worth buying.
Grounded lookups are the expensive calls, so that is where it earns its keep.

EAS Hosting runs on Cloudflare Workers but is managed, so this design assumes
no KV or Durable Objects and therefore no server-side counters. If bindings
turn out to be available, per-install limits become possible; nothing here
depends on that.

## Fallback

A key entered in Settings wins. The app calls Google directly and never touches
the proxy.

This keeps BYO-key users off the shared quota, preserves every code path
already built and tested, and makes a proxy outage degrade to "enter a key"
rather than to a broken feature.

## Provider changes

`aiProvider` gains `'gemini'`, routed through the proxy. `'ollama'` and
`'anthropic'` are unchanged.

**Gemini becomes the default unconditionally**, and the standalone loopback
defect is fixed as a side effect once the default provider needs no local
server.

An earlier draft gated this on the meal-estimation eval: Gemini would take the
default only by outscoring local qwen. That gate asked the wrong question. It
compared accuracy between a provider that runs for every user and one that
requires the user's own PC to be running Ollama on a reachable address. A
provider that does not exist for a user cannot be that user's default at any
score. Availability dominates, so the default moves regardless.

The eval is still run, with a Gemini arm reported per tier and split by
`precise`/`vague` like the others. It no longer decides the default; it tells
us how much accuracy the hosted path costs, which is worth knowing and is the
kind of thing that silently degrades unmeasured. A large regression is a reason
to change the prompt or the model, not a reason to default to a provider most
users cannot run.

## Meal description via Gemini

A new module beside `describeMeal.ts`, reusing its `SYSTEM_PROMPT` verbatim so
the eval compares providers rather than prompts.

Gemini needs a JSON `responseSchema`, which is hand-written to mirror
`MealEstimateSchema`, as `RESPONSE_SCHEMA` already mirrors its own shape in
`api/gemini.ts`. The schema is a hint to the model; the existing zod schema
still performs the real validation on the parsed result, so a response that
satisfies Gemini but not the app is rejected exactly as Claude's would be.

## Error handling

The proxy passes Google's status codes through unchanged, so the existing
mapping keeps working.

One message must change. `postJson` currently maps 400 and 403 to "That Gemini
API key was rejected. Check it in Settings." On the proxy path the user has no
key, so that instruction is actively misleading. The message becomes
path-dependent: key-rejected for the direct path, and a plain service failure
for the proxy path, where a rejected key is the author's problem and not
something the user can act on.

A 429 on the proxy path means the shared quota is exhausted, not that the user
needs billing — also a different message.

## Testing

The proxy route gets tests for: a missing or wrong shared secret rejected, a
model outside the allowlist rejected, a valid request forwarded with the key
attached, and Google's status codes passed through rather than swallowed.

The client gets tests for provider selection: a key present in Settings routes
direct, a key absent routes to the proxy.

The Gemini describe path is measured by the existing meal-estimation eval, as a
new arm, reported per tier and split by `precise`/`vague` like the others.

## Limitations

**The shared secret is extractable** from the APK. Anyone willing to decompile
can use the proxy until the token is rotated, bounded by the daily cap. Play
Integrity attestation is the fix and is out of scope here.

**Grounded calls may exceed a Workers wall-clock limit.** The grounded timeout
is 90s, chosen because 30s was cutting off the hardest lookups. Workers meter
CPU time rather than wall time and a proxy awaiting a fetch uses almost none,
so this is expected to be fine — but it is an assumption to verify against a
real deployment before relying on it, because the failure mode is exactly the
slow lookups the 90s was raised to accommodate.

**The author pays for every non-BYO-key user.** Acceptable at one user,
bounded by the cap, and the reason the cap is not optional.
