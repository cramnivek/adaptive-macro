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

A fresh install should be able to look up a food with no configuration, and
should describe a meal with no configuration provided Gemini earns the default
on the eval. If it does not, the describe path keeps its current defaults and
this goal is met for lookup only — stated plainly rather than assumed, because
that measurement has not been run yet.

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
server-side secret and forwards it.

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
requests per day, set in the console. This bounds the worst case to a chosen
number no matter what happens to the secret. Grounded lookups are the expensive
calls, so this is where it earns its keep.

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

**Gemini becomes the default only if the eval says it should.** The
meal-estimation eval already scores providers by tier and splits `precise` from
`vague`. A Gemini arm is added and run before the default moves. If it scores
worse than the current local model, it does not become the default and this
spec is wrong about that part — the point of having the eval is that this
question is answered by measurement rather than by convenience.

The standalone loopback defect is fixed as a side effect once the default
provider needs no local server, but only if the default actually moves.

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
