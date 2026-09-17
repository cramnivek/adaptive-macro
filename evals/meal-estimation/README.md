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

## A caveat worth keeping in mind

Eight cases is small. With a binary headline metric the noise floor is roughly
`1/sqrt(n·reps)` — about ±35 points at 8 cases and 1 rep, which is wide enough
that a 1-in-8 difference between two models means very little. Treat the first
run as a smoke test that shows the gross differences (a model that is 40% out
will be obvious), and grow the case set before trusting a narrow margin. Adding
your own meals is what makes it decisive.
