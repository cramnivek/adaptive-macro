#!/usr/bin/env node
// Acceptance eval for grounded food lookup. Answers one question: does citing
// a web source actually make the numbers right, or does it just make them
// look sourced? See cases.json for how each reference was obtained - every
// number there traces to an operator-published figure, never to a model.
//
//   node --experimental-strip-types evals/food-lookup/run-lookup-eval.mjs --reps 2
//
// Mirrors evals/meal-estimation/run-eval.mjs: CLI parsing, a per-(case,rep)
// loop, crash-safe JSONL output, resume-by-skipping-done-rows, and a progress
// line on an interval. Left out on purpose: the hillclimb harness-approval
// gate, variant directories, and frozen pairwise refs. Those exist there to
// let an unattended loop rewrite its own runner between rounds; this eval has
// one model, one arm, and a human running it by hand, so none of that applies.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));

// The app's real entry point, imported rather than reimplemented so the eval
// exercises the same prompts, schema and grounding parsing the product ships
// with. Needs `node --experimental-strip-types` (Node 22+) to load the .ts
// source directly.
//
// Loaded lazily, not at module top level: gemini.ts imports
// @adaptive-macros/engine, and that import used to fail under node's native
// loader (extensionless internal specifiers, which Metro and tsc resolve but
// node's ESM loader does not) — fixed in f754deb by adding explicit .ts
// extensions. Kept lazy anyway: --help and --dry-run don't need APP at all,
// and shouldn't pay for importing a package they never touch.
let appPromise;
const getApp = () => (appPromise ??= import('../../mobile/src/api/gemini.ts'));

/**
 * Tighter than meal-estimation's 15%. That eval grades a described meal
 * against a plausible range; this one grades a single named item against a
 * figure an operator actually published, which is a harder reference and
 * deserves a harder bar.
 */
const KCAL_TOLERANCE_PCT = 10;

async function loadCases() {
  const raw = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'));
  return raw.map((c) => ({
    id: c.id,
    query: c.query,
    country: c.country,
    reference: c.reference,
    referenceSource: c.referenceSource,
    hardness: c.hardness,
  }));
}

/**
 * Scores one lookup against its reference. Only kcal is judged pass/fail -
 * protein/carbs/fat ride along in the row for inspection, but the product
 * decision this eval exists to inform is about calories, and grading four
 * correlated macros as independent pass/fails would overstate how much
 * evidence a single case provides.
 *
 * `result.portions` is always `[{label:'100 g',grams:100}, {label:<portion>,
 * grams:<n>}]` per gemini.ts's contract, so the non-100g entry is the portion
 * the reference was written for.
 */
function grade(result, reference) {
  const portion = result.portions.find((p) => p.grams !== 100) ?? result.portions[0];
  const kcalForPortion = (result.per100g.kcal * portion.grams) / 100;
  const errPct = ((kcalForPortion - reference.kcal) / reference.kcal) * 100;
  return {
    // No `grounded` field here: every row that reaches grade() came from a
    // successful lookupFood() call, which already guarantees sources is
    // non-empty, so a boolean re-deriving that would always read true and
    // measure nothing. Whether grounding failed to happen at all is the
    // `ungrounded: true` rows below, not a field on this one.
    kcal_ok: Math.abs(errPct) <= KCAL_TOLERANCE_PCT ? 1 : 0,
    kcal_bias_pct: errPct,
    kcal_for_portion: kcalForPortion,
    portion_grams: portion.grams,
    portion_label: portion.label,
    source_domains: result.sources ?? [],
  };
}

/** Transient provider errors get a few tries; anything else fails the case immediately. */
async function withBackoff(fn, tries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const transient = /429|rate.?limit|quota|overloaded|5\d\d/i.test(String(e?.message ?? ''));
      if (!transient || attempt >= tries - 1) throw e;
      const delay = Math.min(30_000, 1000 * 2 ** attempt) * (0.5 + Math.random());
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function parseArgs(argv) {
  const a = {
    model: 'gemini',
    reps: 1,
    concurrency: 1,
    out: join(HERE, 'results.jsonl'),
    dryRun: false,
  };
  const val = (i) => {
    if (argv[i] === undefined) {
      console.error(`missing value for ${argv[i - 1]}`);
      usage();
      process.exit(2);
    }
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--model') a.model = val(++i);
    else if (k === '--reps') a.reps = +val(++i);
    else if (k === '--concurrency') a.concurrency = +val(++i);
    else if (k === '--out') a.out = val(++i);
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '-h' || k === '--help') {
      usage();
      process.exit(0);
    } else {
      console.error(`unknown argument: ${k}`);
      usage();
      process.exit(2);
    }
  }
  // gemini.ts hardcodes its own model id (see MODEL in that file); --model is
  // a label on the output rows, not a routing switch, because there is only
  // one lookup implementation to route to. Rejecting anything else here
  // catches a typo before it burns a grounded call, not after.
  if (a.model !== 'gemini') {
    console.error(`--model must be 'gemini' (the only wired-up lookup path), got '${a.model}'`);
    usage();
    process.exit(2);
  }
  if (!Number.isInteger(a.reps) || a.reps < 1 || !Number.isInteger(a.concurrency) || a.concurrency < 1) {
    usage();
    process.exit(2);
  }
  return a;
}

function usage() {
  console.error(
    "usage: node --experimental-strip-types run-lookup-eval.mjs [--model gemini] [--reps N] [--concurrency N] [--out FILE] [--dry-run]",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = await loadCases();

  // Every case needs a referenceSource - that's the field a human spot-checks
  // against, and a case missing one has no business being scored.
  const missingSource = cases.filter((c) => !c.referenceSource);
  if (missingSource.length) {
    console.error(`cases missing referenceSource: ${missingSource.map((c) => c.id).join(', ')}`);
    process.exit(2);
  }
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) {
      console.error(`duplicate case id: ${c.id}`);
      process.exit(2);
    }
    ids.add(c.id);
  }

  // Loads and validates cases.json, prints what would run, and stops before
  // any network call. This is how the runner gets verified without an API
  // key and without spending anything - the actual eval run is a human
  // decision, not something this script makes for itself.
  if (args.dryRun) {
    console.error(`[dry-run] ${cases.length} cases x ${args.reps} rep(s) = ${cases.length * args.reps} calls would run:`);
    for (const c of cases) {
      console.error(`  ${c.id.padEnd(36)} "${c.query}" (${c.country})  ref=${c.reference.kcal} kcal  ${c.referenceSource}`);
    }
    console.error('[dry-run] no API calls made.');
    process.exit(0);
  }

  const apiKey = process.env.GEMINI_API_KEY ?? '';
  if (!apiKey.trim()) {
    console.error('GEMINI_API_KEY is not set. Export it and re-run (never hardcode it here).');
    process.exit(2);
  }

  // First real touch of gemini.ts, after validation and the key check, so a
  // broken checkout fails fast rather than mid-run.
  const APP = await getApp();

  mkdirSync(HERE, { recursive: true });
  const resultsPath = args.out;
  const errorsPath = join(HERE, 'errors.jsonl');

  // Resume: which (id, rep) pairs already have a row, so a re-run after a
  // partial failure doesn't re-spend on cases that already scored.
  const done = new Set();
  if (existsSync(resultsPath)) {
    for (const ln of readFileSync(resultsPath, 'utf8').split('\n')) {
      if (!ln.trim()) continue;
      try {
        const r = JSON.parse(ln);
        done.add(`${r.case_id}\0${r.rep}`);
      } catch {
        // A torn final line from an earlier crash - leave it, the append
        // below adds a newline before writing so it isn't merged further.
      }
    }
  }
  for (const p of [resultsPath, errorsPath]) {
    if (!existsSync(p)) continue;
    const buf = readFileSync(p);
    if (buf.length && buf[buf.length - 1] !== 0x0a) appendFileSync(p, '\n');
  }

  const tasks = [];
  for (const c of cases) {
    for (let rep = 0; rep < args.reps; rep++) {
      if (done.has(`${c.id}\0${rep}`)) continue;
      tasks.push({ c, rep });
    }
  }
  console.error(`${tasks.length} of ${cases.length * args.reps} (case, rep) pairs to run`);

  let i = 0;
  let ok = 0;
  let ungrounded = 0;
  let failed = 0;

  async function worker() {
    while (i < tasks.length) {
      const { c, rep } = tasks[i++];
      const t0 = Date.now();
      try {
        const result = await withBackoff(() => APP.lookupFood(c.query, c.country, apiKey));
        const g = grade(result, c.reference);
        appendFileSync(
          resultsPath,
          JSON.stringify({
            case_id: c.id,
            rep,
            query: c.query,
            country: c.country,
            hardness: c.hardness,
            model: args.model,
            ungrounded: false,
            grade: g,
            reference: c.reference,
            reference_source: c.referenceSource,
            food_name: result.name,
            latency_s: (Date.now() - t0) / 1000,
          }) + '\n',
        );
        ok++;
      } catch (e) {
        // An ungrounded answer is the feature correctly refusing to present a
        // guess as sourced - a result worth counting, not an error to retry.
        // It always fails kcal_ok (there is nothing grounded to check the
        // number against), but it lands in results.jsonl as its own row so
        // "how often does grounding fail to happen at all" is a queryable
        // fraction of the total, not folded into either successes or crashes.
        if (e instanceof APP.UngroundedResponseError) {
          appendFileSync(
            resultsPath,
            JSON.stringify({
              case_id: c.id,
              rep,
              query: c.query,
              country: c.country,
              hardness: c.hardness,
              model: args.model,
              ungrounded: true,
              grade: { kcal_ok: 0, kcal_bias_pct: null, source_domains: [] },
              reference: c.reference,
              reference_source: c.referenceSource,
              food_name: null,
              latency_s: (Date.now() - t0) / 1000,
            }) + '\n',
          );
          ungrounded++;
          continue;
        }
        failed++;
        appendFileSync(
          errorsPath,
          JSON.stringify({
            case_id: c.id,
            rep,
            error: String(e?.message || e),
            latency_s: (Date.now() - t0) / 1000,
          }) + '\n',
        );
        console.error(`  ${c.id} rep${rep} FAILED: ${e?.message || e}`);
      }
    }
  }

  const t0 = Date.now();
  const progress = () => {
    const doneCount = ok + ungrounded + failed;
    const el = (Date.now() - t0) / 1000;
    const eta = doneCount ? Math.round((el / doneCount) * (tasks.length - doneCount)) : null;
    console.error(
      `${doneCount}/${tasks.length} done (${ok} ok, ${ungrounded} ungrounded, ${failed} failed), ` +
        `${Math.round(el)}s elapsed` +
        (eta != null ? `, ~${eta}s left` : ''),
    );
  };
  const tick = setInterval(progress, 30_000);
  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, worker));
  clearInterval(tick);
  progress();
  console.error(`done -> ${resultsPath}`);
  process.exit(failed ? 1 : 0);
}

// Guarded so a future selftest can import loadCases/grade without spending
// anything just by importing this file (see evals/meal-estimation/selftest.mjs
// for the pattern this follows).
if (!process.env.EVAL_IMPORT_ONLY) main();

export { grade, loadCases };
