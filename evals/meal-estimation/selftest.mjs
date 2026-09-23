// Offline check of the grader, run before spending anything on a real pass.
//
// Grading here is arithmetic, so it can be verified without touching an API:
// feed it the reference answers and it must score 100%; feed it rubbish and it
// must score 0%. A grader that cannot fail is the most expensive kind of bug,
// because every model looks fine.
const { loadCases, gradeCase } = await import('./run-eval.mjs');

const cases = await loadCases();
const run = (c, totals) => ({ output: totals, estimate: { items: [] } });

const score = async (label, makeTotals) => {
  let pass = 0;
  const errs = [];
  for (const c of cases) {
    const g = await gradeCase(c, run(c, makeTotals(c)), null, {});
    pass += g.grade.kcal_ok;
    errs.push(g.grade.kcal_err_pct);
  }
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  console.log(
    label.padEnd(34),
    `kcal_ok ${pass}/${cases.length}`.padEnd(14),
    `mean err ${mean.toFixed(1)}%`,
  );
  return pass / cases.length;
};

// Oracle: the exact reference, or the midpoint of a vague range.
const oracle = await score('oracle (reference answers)', (c) =>
  c.tier === 'precise'
    ? c.expected
    : {
        kcal: (c.expectedRange.kcal[0] + c.expectedRange.kcal[1]) / 2,
        proteinG: (c.expectedRange.proteinG[0] + c.expectedRange.proteinG[1]) / 2,
        carbsG: (c.expectedRange.carbsG[0] + c.expectedRange.carbsG[1]) / 2,
        fatG: (c.expectedRange.fatG[0] + c.expectedRange.fatG[1]) / 2,
      });

// Null: an empty answer. Must score zero everywhere.
const nul = await score('null (zeros)', () => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }));

// Constant: the same guess for every meal. A grader that rewards this is broken.
const constant = await score('constant (500 kcal every meal)', () => ({
  kcal: 500, proteinG: 30, carbsG: 50, fatG: 20,
}));

// Just inside and just outside the precise tolerance, to prove the boundary.
const inside = await score('10% high (inside 15% tolerance)', (c) =>
  c.tier === 'precise'
    ? { ...c.expected, kcal: c.expected.kcal * 1.1 }
    : { kcal: (c.expectedRange.kcal[0] + c.expectedRange.kcal[1]) / 2, proteinG: 0, carbsG: 0, fatG: 0 });
const outside = await score('25% high (outside tolerance)', (c) =>
  c.tier === 'precise'
    ? { ...c.expected, kcal: c.expected.kcal * 1.25 }
    : { kcal: c.expectedRange.kcal[1] * 1.25, proteinG: 0, carbsG: 0, fatG: 0 });

console.log('');
const checks = [
  ['oracle scores 100%', oracle === 1],
  ['null scores 0%', nul === 0],
  ['constant scores below 50%', constant < 0.5],
  ['10% error still passes precise cases', inside === 1],
  ['25% error fails every case', outside === 0],
];
let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
  if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
