# Meal estimation eval

Measures how accurately a model turns a written meal description into macros,
so the choice of model is made on evidence rather than instinct.

It runs the app's **real** entry point (`mobile/src/ai/describeMeal.ts`) — same
system prompt, same schema, same parsing — so what it measures is what the app
does, not a reimplementation that can drift.

## What it grades

| Metric | Meaning |
|---|---|
| `kcal_ok` | Headline. Within 15% of the reference (precise cases) or inside the plausible range (vague ones). |
| `kcal_err_pct` | Absolute calorie error. Lower is better. |
| `kcal_bias_pct` | **Signed** error. The one that matters most: a model consistently 20% high corrupts your expenditure estimate in one direction over weeks, which is worse than one that is noisy but centred on zero. |
| `macro_mae_g` | Mean absolute error across protein, carbs and fat, in grams. |

Cases come in two tiers. **Precise** meals state exact quantities, and their
reference is computed arithmetically from published per-100 g values — the
reference is auditable, not an opinion. **Vague** meals ("a bowl of spaghetti
bolognese") have no single right answer, so they are graded against a plausible
range with the reasoning for the bounds recorded in `rangeBasis`. Anything
inside the range scores full marks; ranking two plausible answers against each
other would invent precision the reference does not have.

## Running it

Run every command **on one line**. The examples below are split for readability
in bash only; PowerShell does not understand a trailing `\`, and pasting one
produces a confusing `cjs/loader` error as Node tries to open a file called `\`.

**bash / zsh**

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# First run only: approve the harness (a sha over the runner + cases + entry point)
node --experimental-strip-types evals/meal-estimation/run-eval.mjs \
  --flow .claude/hillclimb/meal-estimation --variant baseline \
  --model claude-opus-5 --approve-harness

# The other two arms
node --experimental-strip-types evals/meal-estimation/run-eval.mjs \
  --flow .claude/hillclimb/meal-estimation --variant v1 --model claude-sonnet-5
node --experimental-strip-types evals/meal-estimation/run-eval.mjs \
  --flow .claude/hillclimb/meal-estimation --variant v2 --model claude-haiku-4-5
```

**PowerShell** — one line each, no continuations:

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."

node --experimental-strip-types evals/meal-estimation/run-eval.mjs --flow .claude/hillclimb/meal-estimation --variant baseline --model claude-opus-5 --approve-harness
node --experimental-strip-types evals/meal-estimation/run-eval.mjs --flow .claude/hillclimb/meal-estimation --variant v1 --model claude-sonnet-5
node --experimental-strip-types evals/meal-estimation/run-eval.mjs --flow .claude/hillclimb/meal-estimation --variant v2 --model claude-haiku-4-5
```

Then build the report — it reads every variant directory at once:

```bash
node <skill-dir>/shared/evals/report/build-report-lite.mjs .claude/hillclimb/meal-estimation/
open .claude/hillclimb/meal-estimation/report.html
```

## Testing a local model

Any Ollama model can be an arm. It gets the identical system prompt, and
Ollama's `format` parameter constrains generation to the same JSON schema, so
it is judged on nutrition knowledge rather than on whether it can emit valid
JSON. The runner also raises the context window to 8k, because Ollama's
per-model default can be small enough to truncate the prompt — and a silent
truncation would look like a bad model rather than a harness fault.

```bash
ollama pull qwen2.5:32b
node --experimental-strip-types evals/meal-estimation/run-eval.mjs \
  --flow .claude/hillclimb/meal-estimation --variant v3 --model ollama:qwen2.5:32b --reps 3
```

PowerShell, one line:

```powershell
node --experimental-strip-types evals/meal-estimation/run-eval.mjs --flow .claude/hillclimb/meal-estimation --variant v3 --model ollama:qwen2.5:32b --reps 3
```

Set `OLLAMA_HOST` if the server is not on `http://127.0.0.1:11434`. Local runs
cost nothing, so `--reps 3` is free and worth it — one rep cannot distinguish a
bad model from an unlucky one.

### Check it works first

Before the full eval, run one meal and look at the answer:

```bash
node --experimental-strip-types evals/meal-estimation/smoke.mjs ollama:qwen2.5:32b
```

It prints the items, the assumptions, the total against a known reference, the
time taken, and whether the macros actually account for the calories the model
stated. The eval reports a score; a bad score looks the same whether the model
is wrong about food or the server never received the prompt. This tells them
apart in about ten seconds, and names the fix for the common setup failures
(server not running, model not pulled).

### Which model

What matters here is **factual recall of food composition**, not reasoning or
instruction-following. The schema is enforced by the runtime, so a small model
will still return well-formed JSON — it will just put wrong numbers in it. That
makes size and training recency matter more than they would for a chat task.

On 24 GB of VRAM, at 4-bit quantisation:

| Model | Size on disk | Why |
|---|---|---|
| `qwen2.5:32b` | ~20 GB | Largest that fits comfortably. Strong general knowledge; the most likely to be competitive. |
| `gemma2:27b` | ~16 GB | Different training mix, so a useful second opinion — if it and Qwen agree, that is evidence; if they disagree wildly, the task is harder than it looks. |
| `mistral-small` | ~14 GB | Fast enough to iterate with, leaves headroom for a large context. |

Tags move, so let `ollama pull` confirm them rather than trusting this table;
the runner reports a missing model by name and tells you what to pull.

Run two or three and compare. The point of the table is not that one of these
is correct — it is that guessing is unnecessary when measuring costs nothing.

### What to expect

Worth setting expectations honestly before the download: a 32B open model is
a few hundred times smaller than a frontier model, and nutrition figures are
memorised facts rather than derivable ones. It is entirely plausible that the
local model lands within tolerance on plain foods ("150 g chicken breast") and
falls apart on composed dishes ("fish and chips at the pub"), because the first
is one lookup and the second is a portion judgement plus several lookups.

The `precise` and `vague` tiers in the report split exactly along that line, so
the result will show which of those two happened rather than a single verdict.
If the local model handles the precise tier and fails the vague one, a sensible
outcome is to use it for most logging and reach for a hosted model only when
the description is loose.

## Testing the hosted Gemini path

The app's default meal-description provider is Gemini, called through
`mobile/src/ai/geminiDescribe.ts` (`describeMealWithGemini`) rather than
through `describeMeal.ts`. It shares `SYSTEM_PROMPT` with the Claude path
verbatim, so this arm measures the provider, not a different prompt. The
default moved to Gemini on availability grounds — Ollama needs the user's own
PC reachable from their phone, which cannot be anyone else's default — so this
arm does not gate that choice. It measures what the move costs in accuracy,
which is worth knowing regardless.

The eval must bill your own key directly and never go through the deployed
proxy, so it needs `GEMINI_API_KEY` in the environment (not `ANTHROPIC_API_KEY`,
and not the proxy's token). `routeFor` (`mobile/src/api/gemini.ts`) treats any
non-empty key as bring-your-own and skips the proxy entirely — that's the
whole mechanism, and it's why the key must be present rather than left for the
app to fall back on the shared allowance.

`geminiDescribe.ts` imports `../api/gemini` with no file extension, which
Metro (the app's real bundler) resolves but node's own ESM loader does not.
Rather than touch that import — the app is otherwise finished and out of
scope here — `ts-relative-imports-loader.mjs` in this directory is a small
node loader hook that retries a failed relative resolution with `.ts`
appended, registered with `--import`. Only the Gemini arm needs it; the
Ollama and Claude arms are unaffected either way.

**bash / zsh**

```bash
export GEMINI_API_KEY=AIza...

node --experimental-strip-types --import 'data:text/javascript,import { register } from "node:module"; import { pathToFileURL } from "node:url"; register("./evals/meal-estimation/ts-relative-imports-loader.mjs", pathToFileURL("./"));' \
  evals/meal-estimation/run-eval.mjs --flow .claude/hillclimb/meal-estimation --variant v7 --model gemini-3.5-flash --reps 3 --approve-harness
```

**PowerShell** — one line:

```powershell
$env:GEMINI_API_KEY = "AIza..."
node --experimental-strip-types --import "data:text/javascript,import { register } from `"node:module`"; import { pathToFileURL } from `"node:url`"; register(`"./evals/meal-estimation/ts-relative-imports-loader.mjs`", pathToFileURL(`"./`"));" evals/meal-estimation/run-eval.mjs --flow .claude/hillclimb/meal-estimation --variant v7 --model gemini-3.5-flash --reps 3 --approve-harness
```

Check it works first, same idea as the Ollama smoke check above — this bills
your key for one call, not the whole set:

```bash
node --experimental-strip-types --import 'data:text/javascript,import { register } from "node:module"; import { pathToFileURL } from "node:url"; register("./evals/meal-estimation/ts-relative-imports-loader.mjs", pathToFileURL("./"));' \
  evals/meal-estimation/smoke.mjs gemini-3.5-flash
```

### Result: Gemini vs. the local model

8 meals × 3 reps, both on the app's current prompt (the `v5` row above), so
the only variable is the provider:

| Arm | Precise ok | Precise bias | Vague ok | Vague bias |
|---|---|---|---|---|
| `v5` — qwen2.5:32b (local, free) | 15/15 | −2.08% | 6/9 | −6.25% |
| `v7` — gemini-3.5-flash (hosted, this app's default) | 15/15 | **−1.66%** | **9/9** | **0.00%** |

Gemini is not a regression — it is a clear improvement on both tiers, and it
resolves the local model's worst known failure: `vague-fish-and-chips`, which
qwen landed on 650 kcal every single time (18.75% under this repo's 800 kcal
floor), Gemini put at 980–1105 kcal across its three reps, comfortably inside
the 800–1450 range. Nothing here argues for a prompt or model change; the
default already made on availability grounds also happens to be the more
accurate one.

The usual small-n caveat applies (see below) — 8 cases is not a lot — but a
9/9 clean sweep on the tier the local model struggled with, on top of a
tighter precise-tier bias, is a large enough gap that it is very unlikely to
be noise.

## Adding your own meals

The eight cases here are a seed, not a claim about what you eat. The eval is
only worth what its inputs are worth, so add meals you actually have.

For a **precise** case, list the components with their per-100 g values and the
reference is summed for you:

```json
{
  "id": "my-usual-lunch",
  "tier": "precise",
  "prompt": "200 g chicken thigh with 150 g couscous and a tablespoon of olive oil",
  "components": [
    { "food": "Chicken thigh, cooked", "grams": 200,
      "per100g": { "kcal": 209, "proteinG": 26, "carbsG": 0, "fatG": 10.9 } }
  ]
}
```

For a **vague** case, give a range and say in `rangeBasis` how you arrived at
it, so a later reader can disagree with the bounds rather than guess at them.

Per-100 g values are on any packet, or in USDA FoodData Central.

## What has been measured

qwen2.5:32b through Ollama, 8 meals x 3 reps per arm:

| Prompt | Precise ok | Precise bias | Vague ok | Vague bias |
|---|---|---|---|---|
| Original app prompt | 15/15 | −2.54% | 3/9 | −10.85% |
| Drop the anti-inflation line | 15/15 | −2.82% | 5/9 | −9.87% |
| Add named-dish → commercial portion | 15/15 | −2.08% | **6/9** | **−6.25%** |

The third won on both tiers and is now the app's prompt, so the default arm
measures it. The `v4` and `v6` variants in the runner reproduce the other two.

The hypothesis going in was that the prompt's own "do not inflate estimates to
be safe" instruction was causing the undershoot. Measurement said otherwise:
removing it helped less than adding a specific correction, and it cost a little
accuracy on the precise tier. The problem was not the instruction but the
absence of any guidance about what a *named dish* implies.

### What is still unresolved

**Fish and chips did not move.** 650 kcal under every prompt, identical across
all three reps of each — that is not noise, it is the model holding a firm
belief. Against this repo's 800 kcal floor it fails by 18.75%.

That floor is the weakest bound in the set and deserves stating plainly.
Deriving it independently: a pub cod fillet is 200–280 g battered and fried at
~230 kcal/100 g (460–644 kcal), chips 250–350 g at ~190–250 kcal/100 g
(475–875), giving 935–1519 for a full plate, and "ate most of it" at 75–100%
gives roughly 700–1500. On that reasoning the floor should arguably be nearer
700 than 800, which would make the miss smaller — though still a miss.

**The bound has deliberately not been changed.** Adjusting ground truth after
seeing a model's answer is how an eval stops being able to disagree with you.
It is recorded here instead, and a run against a frontier model would settle it
in one pass: if that model also lands under 800, the bound is wrong rather than
the local model.

One related detail worth knowing when reading the original 3/9: the bolognese
case was passing at *exactly* the 500 kcal floor of its range. In-range scores
full marks by design, so that pass was as marginal as it could be while still
counting — consistent with the undershoot the bias figure shows.

## A caveat worth keeping in mind

Eight cases is small. With a binary headline metric the noise floor is roughly
`1/sqrt(n·reps)` — about ±35 points at 8 cases and 1 rep, which is wide enough
that a 1-in-8 difference between two models means very little. Treat the first
run as a smoke test that shows the gross differences (a model that is 40% out
will be obvious), and grow the case set before trusting a narrow margin. Adding
your own meals is what makes it decisive.
