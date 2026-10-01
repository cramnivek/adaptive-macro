# Relevance-aware food lookup

Design, 2026-10-01.

## Problem

Search `crispyking breast` and the databases return twelve results: turkey breast,
pheasant breast, quail breast, veal breast. Every one of them is confident, correctly
formatted, and useless. The product you asked for is not among them.

Neither path to AI is reachable from there. Auto-lookup is gated on zero results
(`mobile/app/search.tsx:172`):

```ts
if (results.length > 0 || trimmed.length < 2) return;
```

and the manual button only appears at one or two results (`search.tsx:137`):

```ts
const canLookUp =
  !showingFrequent && !loading && shown.length > 0 && shown.length < THIN_RESULT_COUNT;
```

Twelve results means no automatic call **and** no button. The feature is unreachable
exactly where the databases are weakest — branded and restaurant items.

The assumption underneath was that irrelevance correlates with *few* results. The
comment in the code says so: "the case this exists for returned one irrelevant result,
not an empty list." `crispyking breast` disproves it. The databases match on the common
word and return a full page.

## Goal

Results that do not answer the query are treated as a miss, and the existing
auto-lookup handles them. No new model call on the common path.

## Non-goals

- **Asking the model to judge relevance.** It would spend a call on nearly every search
  that returns results, which is most searches, and delay results the user can already
  see. Nothing in the screenshot needs intelligence to reject: `crispyking` appears in
  none of the twelve names.
- **Ranking or re-ordering results.** Only the decision to look up changes.
- **Spell correction or fuzzy matching.** A typo becoming a lookup is an acceptable
  outcome; see *Risks*. Stemming is out of scope beyond one case: a trailing plural
  `s`/`es` is stripped, because `almonds` against `Almond, raw` would otherwise spend a
  charged call on a perfect match. That is not a stemmer, and nothing else is inferred.
- **Widening the manual button.** If the check judges results relevant and the user
  disagrees, there is still no override. Deliberate: see whether the check is right
  before adding a second path.
- **Guarding against a database outage.** `searchFoods` returns `{ foods, errors }`, and
  an outage currently looks like zero results and spends a lookup. That was considered
  and left alone: a user whose databases are down is better served by an AI answer than
  by nothing, which is what the lookup gives them.

## The check

`packages/engine/src/foods.ts`, beside the `Food` type it reasons about. The engine is a
separate package with its own suite and no React Native import, so this is testable
under the project's node harness with no new configuration.

```ts
export const resultsAnswerQuery = (query: string, foods: Food[]): boolean
```

Normalise both sides identically: decompose accents and strip the combining marks,
lowercase, replace every non-alphanumeric character with a space, collapse runs of
spaces. Accents must go first and on both sides, because they are asymmetric in
practice — people type `jalapeno`, databases store `Jalapeño`. Leaving them in
normalises the name to `jalape o`, so the query word is not a substring of it and a
perfect match spends a lookup. Apply it to the query and to each food's
`name` plus `brand` joined — `brand` matters, because `Oscar Mayer, Chicken Breast`
carries the brand in a separate field and a check against `name` alone would miss it.

Tokenise the normalised query on spaces, drop tokens shorter than three characters,
and drop a short list of function words — `and`, `the`, `with`, `for`, `from`. The
length filter alone is not enough: `the` is exactly three characters, so without this
"bread and butter" turns on whether some result happens to contain `and` inside a
longer word, which `Island` does and `Sourdough` does not. A coin toss must not decide
a charged call.
A token is **covered** when it appears as a substring of any food's normalised
haystack. The results answer the query when every surviving token is covered.

Two deliberate choices:

- **Substring, not whole-word.** `breast` covers `breasts`, `pulldown` covers
  `pull down`. The reverse does not follow — a longer query word never matches a
  shorter name word — which is why the plural `s`/`es` is stripped as a second variant
  of each token. It also means `ham` is covered by `graham`, which is a false *positive*
  — it makes the app less likely to spend a call. That is the conservative direction
  for a feature whose risk is cost, so the looser rule is the right one.
- **Every token must be covered.** One uncovered distinctive word is the whole signal.
  Requiring all of them is what catches `crispyking` while leaving `chicken breast`
  alone.

Edge cases: a query with no surviving tokens (`of a`, `and the`) returns `true`, because
there is nothing to judge and firing a call on it would be spending money on noise. An
empty `foods` array returns `false`, consistent with the zero-results case the existing
effect already handles first.

On the screenshot: `breast` is covered twelve times, `crispyking` zero times, so the
function returns `false` and the lookup fires.

## Wiring

`mobile/app/search.tsx`, in the auto-lookup effect. One condition changes:

```ts
if (trimmed.length < 2) return;
if (results.length > 0 && resultsAnswerQuery(trimmed, results)) return;
```

Everything else is unchanged and already correct: the 350 ms search debounce, the
1,200 ms settle, `MAX_AUTO_ATTEMPTS = 2` per distinct query, the `latestQuery` and
`mounted` guards against out-of-order and post-unmount writes, and `runLookup`'s
success path closing the query out.

## Saying something is happening

Today the "looking it up" copy lives in the empty state, because until now a lookup
only ever ran when there was nothing on screen. Now a lookup can run with twelve
results visible, and the grounded call takes up to 90 seconds. Without a visible
signal, the screen would sit there looking finished while a call ran.

So when a lookup is running and results are on screen, a line appears above them:

> These do not look like what you searched. Looking it up… {n}s

reusing the `lookupElapsed` counter that already exists for exactly this reason. The
results stay visible and selectable underneath — the check is a guess, and a guess must
not take away an answer that might have been right. `LookupCandidateSheet` opens over
them when the lookup returns, as it does now.

## Testing

In `packages/engine/test/foods.test.ts`, beside the tests already there.
Pure, no mocking:

1. `crispyking breast` against the twelve names from the screenshot returns `false`
2. `chicken breast` against those same twelve returns `true`
3. a brand matched only through the `brand` field — query `oscar mayer turkey`,
   result `name: 'Turkey Breast', brand: 'Oscar Mayer'` — returns `true`
4. case and punctuation fold: `oscar-mayer` against `Oscar Mayer,` returns `true`
5. tokens under three characters are ignored: `of a` returns `true`
5b. function words are ignored: `the chicken and the breast` returns `true`
6. an empty result list returns `false`
7. the documented false positive holds: `ham` is covered by `Graham Crackers`

No test asserts on `search.tsx`; it imports React Native and would fail to run under
`environment: 'node'`. The wiring is two lines and is verified in a browser against the
staged build, where `/api/gemini` is live — Metro cannot serve that route.

## Risks

**More grounded lookups fire, and the grounded call is the charged one.** This is the
point of the change, not a side effect, but it is a real increase. The guards are
unchanged: one attempt per distinct query, two maximum, behind a settle delay.

**A typo now fires a lookup.** `chiken breast` has an uncovered token. Judged
desirable — the model handles a misspelling better than the databases do.

**A query in a non-Latin script never fires a lookup.** Stripping non-alphanumerics
leaves no tokens, and no tokens means "nothing to judge". Those users get the database
results and the manual button, and no automatic call. Accepted: firing on every such
query would be worse than not firing.

**A specific query whose words legitimately do not appear in any result name fires a
lookup that may find nothing.** Costs one call, capped at two, and the user sees the
existing `UngroundedResponseError` message.

## Order of work

One task. The pure function and its tests in `packages/engine`, then the
two-line condition change and the status line in `search.tsx`.
