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

One small service on **Google Cloud Run**, whose free tier (2M requests per
month) is far above what this needs.

It is a **thin passthrough**: the app sends the Gemini request body it would
otherwise have sent to Google, and the proxy attaches the key from a
server-side environment variable and forwards it.

### Why not EAS Hosting

An earlier draft put this on EAS Hosting as an Expo Router API route, because
the project already deploys there and the free tier was ample. That was
deployed and measured, and it does not work:

| Call | Result |
|---|---|
| Direct from a dev machine, ungrounded | 200 |
| Direct from a dev machine, grounded | 200, correctly cited |
| Through the deployed EAS route, ungrounded | 400 `FAILED_PRECONDITION` |
| Through the deployed EAS route, grounded | 400, immediately |

The error is `User location is not supported for the API use`, on 3 of 3
attempts, for every call rather than only grounded ones.

It is not a region problem. A temporary diagnostic route reported the worker's
egress as `colo=HKG loc=PH ip=2a06:98c0:3600::103` — the same country as the
dev machine, which succeeds. Google is refusing the address itself: a
Cloudflare anycast IP it cannot attribute to a permitted consumer location for
`generativelanguage.googleapis.com`. No EAS Hosting region can fix that,
because what is rejected is the IP's ownership rather than where it sits.

Cloud Run replaces it because it gives an attributable egress on Google's own
network in a region chosen explicitly. The handler itself is unchanged: it is a
pure `(Request, ProxyEnv) => Promise<Response>`, so the port is an HTTP
adapter, not a rewrite.

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

The app finds the proxy through a hardcoded default pointing at the deployed
Cloud Run URL, in `mobile/src/api/gemini.ts`, with `EXPO_PUBLIC_API_BASE` as an
optional override. There is no local route to exercise any more — every build
talks to the deployed service unless that variable is set.

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

The service keeps no state, so there are no server-side counters. Cloud Run
could hold state, but nothing here needs it, and per-install limits are not
worth a datastore until the proxy is public.

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

**The 90-second grounded call has been verified against the deployment.** The
timeout is 90s because 30s was cutting off the hardest lookups. The EAS
deployment never reached this question — every call failed at the geo gate
before any work started — so it carried over unanswered to Cloud Run, which
was deployed with `--timeout 120`, comfortably above the 90s client timeout. A
real grounded call through the deployed service returned 200 in 17 seconds,
citing the operator's own site, closing the question.

**The author pays for every non-BYO-key user.** Acceptable at one user,
bounded by the cap, and the reason the cap is not optional.
