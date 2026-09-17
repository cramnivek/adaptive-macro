// One meal against one model, printed in full. Run this before the eval.
//
// The eval reports scores; this reports the actual answer. When a local model
// is misconfigured the eval just shows a bad number, and a bad number looks
// identical whether the model is wrong about food or the server never got the
// prompt. This distinguishes them in about ten seconds.
//
//   node --experimental-strip-types evals/meal-estimation/smoke.mjs ollama:qwen2.5:32b
//   node --experimental-strip-types evals/meal-estimation/smoke.mjs claude-opus-5

const APP = await import('../../mobile/src/ai/describeMeal.ts');
const z = await import('zod/v4');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const model = process.argv[2] ?? 'ollama:qwen2.5:32b';

// A precise case from the eval, so the answer can be checked against a
// reference rather than eyeballed. 2 eggs + 10 g butter + 60 g bread.
const MEAL = '2 large eggs (100 g total without shell) scrambled with 10 g salted butter, and 60 g of white sourdough toast';
const REFERENCE = { kcal: 377, proteinG: 18.1, carbsG: 30.1, fatG: 19.6 };

const runOllama = async (tag) => {
  const schema = z.toJSONSchema(APP.MealEstimateSchema);
  const res = await fetch(OLLAMA_HOST + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: tag,
      stream: false,
      format: schema,
      options: { temperature: 0, num_ctx: 8192, num_predict: 2048 },
      messages: [
        { role: 'system', content: APP.SYSTEM_PROMPT },
        { role: 'user', content: MEAL },
      ],
    }),
  }).catch((e) => {
    throw new Error(
      `Could not reach Ollama at ${OLLAMA_HOST}. Is it running? (${e.message})`,
    );
  });

  if (res.status === 404) {
    throw new Error(`Ollama has no model '${tag}'. Pull it: ollama pull ${tag}`);
  }
  if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);

  const body = await res.json();
  return {
    estimate: APP.MealEstimateSchema.parse(JSON.parse(body.message?.content ?? '')),
    usage: { inputTokens: body.prompt_eval_count ?? 0, outputTokens: body.eval_count ?? 0 },
  };
};

console.log(`model:  ${model}`);
console.log(`meal:   ${MEAL}\n`);

const started = Date.now();
const result = model.startsWith('ollama:')
  ? await runOllama(model.slice('ollama:'.length))
  : await APP.describeMeal(MEAL, process.env.ANTHROPIC_API_KEY ?? '', model);
const seconds = (Date.now() - started) / 1000;

const totals = result.estimate.items.reduce(
  (sum, i) => ({
    kcal: sum.kcal + i.kcal,
    proteinG: sum.proteinG + i.proteinG,
    carbsG: sum.carbsG + i.carbsG,
    fatG: sum.fatG + i.fatG,
  }),
  { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
);

for (const item of result.estimate.items) {
  console.log(
    `  ${item.name} — ${Math.round(item.grams)} g, ${Math.round(item.kcal)} kcal ` +
      `(P ${item.proteinG.toFixed(1)} C ${item.carbsG.toFixed(1)} F ${item.fatG.toFixed(1)}) [${item.confidence}]`,
  );
  if (item.assumption) console.log(`      assumed: ${item.assumption}`);
}

if (result.estimate.notes) console.log(`\nnotes:  ${result.estimate.notes}`);

const err = ((totals.kcal - REFERENCE.kcal) / REFERENCE.kcal) * 100;
console.log(`\ntotal:     ${Math.round(totals.kcal)} kcal  (P ${totals.proteinG.toFixed(0)} C ${totals.carbsG.toFixed(0)} F ${totals.fatG.toFixed(0)})`);
console.log(`reference: ${REFERENCE.kcal} kcal  (P ${REFERENCE.proteinG} C ${REFERENCE.carbsG} F ${REFERENCE.fatG})`);
console.log(`error:     ${err > 0 ? '+' : ''}${err.toFixed(1)}%  ${Math.abs(err) <= 15 ? '(within the 15% tolerance)' : '(outside the 15% tolerance)'}`);
console.log(`took:      ${seconds.toFixed(1)}s, ${result.usage.outputTokens} output tokens`);

// Macros that do not account for the stated calories mean the model wrote two
// numbers that disagree — worth seeing directly, since the eval's totals-based
// score can hide it.
const implied = totals.proteinG * 4 + totals.carbsG * 4 + totals.fatG * 9;
const drift = Math.abs(implied - totals.kcal) / Math.max(totals.kcal, 1);
console.log(
  `coherence: macros imply ${Math.round(implied)} kcal vs the ${Math.round(totals.kcal)} stated ` +
    `(${(drift * 100).toFixed(0)}% apart)${drift > 0.15 ? '  <- the model is contradicting itself' : ''}`,
);
