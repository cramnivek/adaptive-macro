# Grounded food lookup

Design, 2026-09-17.

## Problem

Searching for restaurant and chain food returns nothing usable. Searching
"Jollibee" returns an unrelated Indian snack brand, plus two API errors.

This is not a bug in the search code and not a missing data source of the kind
already wired up. It is a category gap: USDA covers whole foods and US packaged
retail, Open Food Facts covers barcoded packaged goods. Neither is built for
restaurant menus, so adding more sources of that shape cannot surface
Chickenjoy.

Measured during this investigation:

- Open Food Facts' Search-a-licious API returns **0 hits** for `jollibee` and
  **0 hits** for `chickenjoy`.
- Open Food Facts' legacy `cgi/search.pl` endpoint, which the app currently
  calls, returns **503** on both the `ph` and `world` subdomains. That is a
  separate defect, tracked below as out of scope for this spec.
- FatSecret does carry the Philippine menu, but its free tier blocks OAuth 2.0
  requests from non-whitelisted source IPs and directs integrators to call
  through a proxy server. A phone on mobile data has no stable IP to whitelist,
  and this app has no backend by design.

## Goals

Resolve one named product to a reusable food record, using a web-grounded
model, with the sources it used visible before anything is saved.

## Non-goals

- Replacing the describe-a-meal flow. That estimates a composed meal from a
  freeform sentence, runs on local qwen, and is already measured. This is a
  different job.
- Changing which engine estimates meals. `aiProvider` is untouched.
- Photo-based estimation. Gemini is multimodal and the confirm-then-save flow
  below would generalise unchanged (a photo estimate simply has no sources), but
  it is not built here.
- A pending-approval queue. The confirmation sheet is the provisional stage.
- Authority scoring of sources. See "Provenance".

## Provider choice

Gemini, using Grounding with Google Search.

- Grounding is billed per grounded query with **5,000 free per month** on the
  Gemini 3.x family, and only when a result returns at least one grounding URL.
  Expected usage for a personal logger is one or two orders of magnitude below
  that.
- Google AI Pro additionally includes $10/month in Google Developer Program
  credits that can be applied to the Gemini API. The subscription itself does
  not include API usage; a separate AI Studio key is required.
- Gemini 3 supports Grounding with Google Search **and** structured outputs in
  the same request, so one call can search, read, and return schema-valid JSON
  alongside the URLs it used. No two-pass workaround.

### Configuration boundary

Gemini does **not** become a third value in `aiProvider`. That union
(`'ollama' | 'anthropic'`) answers "who estimates my meals", where the
local-first default is deliberate and evidence-backed. Food lookup is a
different capability with different economics.

New settings, independent of `aiProvider`:

```
foodLookup: {
  enabled: boolean;      // false until a key is present
  geminiApiKey: string;  // user-supplied, device-only, same pattern as usdaApiKey
}
```

Meal estimation continues to run on local qwen, free and offline, regardless of
this setting.

## Entry point

The search screen's empty state, below the existing "Create a food" button:
**"Look it up with AI"**.

It renders only after every source has settled and fewer than three foods were
returned, so it never competes with a healthy result set. Three rather than zero
because the case that motivated this returned exactly one irrelevant result, not
none. The threshold is a named constant, not scattered literals. The button is
hidden entirely when `foodLookup.enabled` is false.

## Data flow

1. User taps "Look it up with AI" from a thin search result.
2. App calls Gemini with the query string, the `foodCountry` setting (`ph`,
   already in Settings — it tells the model which market's menu to look for),
   the `google_search` tool, and a `responseSchema`.
3. Gemini searches, reads pages, returns structured JSON plus
   `groundingMetadata` containing the URLs used.
4. App validates (see below), derives `per100g`, and builds a candidate `Food`.
5. Confirmation sheet shows the numbers and the source domains.
6. On confirm: `saveFood({ source: 'ai', sources, fetchedAt })`. On cancel:
   nothing is written.

Once saved, `searchLocalFoods` already ranks cached foods first, so the second
occurrence of that food is an offline hit with no API call.

## Response schema and the arithmetic boundary

The app's canonical basis is `per100g`, but restaurant food is not published
that way. Nobody states "Chickenjoy per 100 g"; they state "1 piece, 380 kcal".

The schema therefore asks for what sources actually state:

```
{
  name: string,
  brand: string | null,
  portionLabel: string,     // "1 piece", "1 serving (411 g)"
  portionGrams: number,
  kcal: number,             // for that portion, not per 100 g
  proteinG: number,
  carbsG: number,
  fatG: number,
  fiberG: number | null
}
```

**The app derives `per100g`; the model never does the division.** It is exact
arithmetic we can perform perfectly, and the meal-estimation eval already showed
models are adequate at recall and sloppy at derived numbers.

`portions` is built as `[{ label: '100 g', grams: 100 }, { label: portionLabel,
grams: portionGrams }]`, matching what the Open Food Facts mapper already does.

### Coherence validation

Reusing the check the eval smoke test already prints: do
`proteinG × 4 + carbsG × 4 + fatG × 9` account for the stated `kcal`?
`KCAL_PER_G` is already exported from the engine.

This already exists. `isNutritionallyConsistent(n, tolerance = 0.15)` is
exported from the engine and is **already used by the search screen** to flag
suspect rows, alongside `kcalFromMacros`. Reuse it at its existing default
rather than introducing a second, differently-tuned threshold — one notion of
"these numbers disagree" for the whole app.

Outside tolerance, the candidate is shown with a visible warning rather than
presented as clean.

The warning does not block saving — the number may still be the best available.
It marks the candidate as internally inconsistent so the decision is informed.

## Provenance

`Food` gains `sources?: string[]`. The `foods` table gains a matching column via
an additive migration, following the existing `MIGRATIONS` array and
`PRAGMA user_version` pattern. `fetchedAt` is already in the type and is set —
menus change, and a number from 2026 should be visibly from 2026.

Source domains are shown **before** the save, on the confirmation sheet. Nothing
is written until the user confirms with the evidence in front of them.

### No authority badges — deliberate

The obvious feature is classifying sources as "official" versus "third-party"
so the UI can reassure. It is rejected.

Google's own results for this query include `jollibeemenuupdates.com`,
`jollibee-menus.com`, and `nutritionx.us`. Any cheap heuristic for "is this the
brand's own site" — domain contains the brand name being the obvious one —
marks all three as official. A badge reading "verified" over an SEO aggregator
is strictly worse than no badge, because it manufactures confidence the data has
not earned.

So: list the domains, no badge, no score. Simpler to build and more honest. If
authority signalling is wanted later, the only version that works is a
hand-maintained whitelist of brand domains, which should be adopted
deliberately rather than inherited by default.

### Permanent marking

`source: 'ai'` already exists for this purpose, documented as "Estimated by
Claude from a description, then confirmed by the user" — the same shape. A
marker rides along in search results and on the food record, so a grounded
estimate never becomes visually indistinguishable from a USDA measurement later.

UI copy states the limitation plainly, matching how Settings already describes
the local model's weakness: *estimated from web sources, check against the
packaging or receipt when you can*. Not "nutrition facts".

## Error handling

**Grounding that did not ground — the load-bearing case.** Gemini can answer
from its own weights and return no `groundingMetadata` URLs. That response is
schema-valid, confident, and entirely unsourced; treating it as a web lookup
would reproduce exactly the laundering this design rejects. **No grounding URLs
means the lookup failed**: report "couldn't find reliable information for that",
offer "Create a food", save nothing.

| Case | Behaviour |
| --- | --- |
| No grounding URLs | Treated as failure. Nothing saved. |
| Macros incoherent with kcal | Shown with a warning; user decides. |
| No result found | Plain not-found; route to "Create a food". |
| Missing / invalid key, quota exceeded | Mapped messages, following the `describeErrorMessage` pattern in `describeMeal.ts`. |
| Offline | Feature reports unavailable rather than spinning. |

**Timeout.** `fetchJson` hard-stops at 10s, which is right for a database
lookup but wrong here — grounded search is slower because it is searching and
reading pages. This path gets its own ~30s ceiling plus the elapsed-second
counter the describe screen already uses for the local-model wait.

## Testing

Unit-testable offline, as pure functions:

- per-portion → `per100g` derivation
- macro/kcal coherence check, including boundary cases
- response → `Food` mapping with missing, null, and garbage fields
- domain extraction from grounding URLs
- the no-grounding-URLs rejection path

### Acceptance criterion

Unit tests establish that the plumbing works, not that the feature works. The
acceptance measure is an eval, scored like `evals/meal-estimation`: a small set
of named chain items with genuinely published ground truth — Jollibee USA's
official nutrition PDF provides real per-item numbers, Chickenjoy at 380
kcal/piece among them.

This answers the question that decides the feature's value: **does grounded
lookup beat the local model's guess on named dishes?** The v5 run left
`vague-fish-and-chips` at −18.75% across every rep, and could not separate
"the model undershoots" from "my plausible bounds are wrong". Grounded lookup
against published manufacturer numbers is a cleaner target, because the ground
truth is not self-authored.

"It returned something plausible" is not the bar.

## Out of scope, noted here

The Open Food Facts legacy `cgi/search.pl` endpoint returns 503 on both
subdomains and should be migrated to Search-a-licious
(`https://search.openfoodfacts.org/search`, verified returning 200). That is an
independent fix and does not belong in this change.
