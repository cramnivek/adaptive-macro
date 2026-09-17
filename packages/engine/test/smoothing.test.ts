import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_OPTIONS,
  type ExpenditureModelOptions,
  estimateExpenditure,
} from '../src/expenditure';
import { diag, identity, invert, rtsSmooth } from '../src/kalman';
import { KCAL_PER_KG_TISSUE } from '../src/units';
import { rmse, simulate } from './helpers';

const options = (initialExpenditureKcal: number): ExpenditureModelOptions => ({
  ...DEFAULT_MODEL_OPTIONS,
  initialExpenditureKcal,
});

const steadyLoss = (seed: number, days = 140) =>
  simulate({
    startDate: '2026-01-01',
    days,
    startKg: 86,
    tdeeOn: () => 2750,
    intakeOn: () => 2300,
    kcalPerKgTissue: KCAL_PER_KG_TISSUE,
    scaleNoiseSdKg: 0.7,
    seed,
  });

describe('invert', () => {
  it('inverts a 2x2 matrix', () => {
    const inverse = invert([
      [4, 7],
      [2, 6],
    ]);
    expect(inverse![0][0]).toBeCloseTo(0.6, 10);
    expect(inverse![0][1]).toBeCloseTo(-0.7, 10);
    expect(inverse![1][0]).toBeCloseTo(-0.2, 10);
    expect(inverse![1][1]).toBeCloseTo(0.4, 10);
  });

  it('round-trips to the identity', () => {
    const m = [
      [0.49, -1.2],
      [-1.2, 9000],
    ];
    const inverse = invert(m)!;
    const product = m.map((row, i) =>
      row.map((_, j) => row.reduce((sum, v, k) => sum + v * inverse[k][j], 0)),
    );
    expect(product[0][0]).toBeCloseTo(1, 8);
    expect(product[0][1]).toBeCloseTo(0, 8);
    expect(product[1][1]).toBeCloseTo(1, 8);
  });

  it('returns null for a singular matrix rather than infinities', () => {
    expect(
      invert([
        [1, 2],
        [2, 4],
      ]),
    ).toBeNull();
  });

  it('inverts a larger matrix, including one needing a pivot swap', () => {
    // A zero in the first pivot position forces the row swap.
    expect(
      invert([
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, 2],
      ]),
    ).toEqual([
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0.5],
    ]);
  });
});

describe('rtsSmooth', () => {
  it('handles degenerate inputs', () => {
    expect(rtsSmooth([])).toEqual([]);
    const only = { x: [1, 2], P: diag([1, 1]) };
    expect(rtsSmooth([{ filtered: only }])).toEqual([only]);
  });

  it('leaves a step with no successor information untouched', () => {
    const a = { x: [1, 2], P: diag([1, 1]) };
    const b = { x: [3, 4], P: diag([1, 1]) };
    // No predicted/F on the first step, so there is nothing to propagate back.
    const result = rtsSmooth([{ filtered: a }, { filtered: b }]);
    expect(result[0]).toEqual(a);
    expect(result[1]).toEqual(b);
  });

  it('pulls an earlier state toward what the future revealed', () => {
    const first = { x: [10, 0], P: diag([4, 4]) };
    const predicted = { x: [10, 0], P: diag([5, 5]) };
    const last = { x: [14, 0], P: diag([1, 1]) };

    const [smoothedFirst] = rtsSmooth([
      { filtered: first, predicted, F: identity(2) },
      { filtered: last },
    ]);

    // The future says 14; the first day should move up from 10 toward it, but
    // not all the way, because its own measurement still carries weight.
    expect(smoothedFirst.x[0]).toBeGreaterThan(10);
    expect(smoothedFirst.x[0]).toBeLessThan(14);
    // Knowing the future cannot make an estimate less certain.
    expect(smoothedFirst.P[0][0]).toBeLessThanOrEqual(first.P[0][0] + 1e-9);
  });
});

describe('smoothed vs filtered series', () => {
  it('tracks true weight more closely than the forward filter does', () => {
    const sim = steadyLoss(17);
    const { series, filtered } = estimateExpenditure(sim.observations, options(2750));

    const smoothedError = rmse(
      series.map((s) => s.trendWeightKg),
      sim.trueWeightKg,
    );
    const filteredError = rmse(
      filtered.map((s) => s.trendWeightKg),
      sim.trueWeightKg,
    );

    expect(smoothedError).toBeLessThan(filteredError);
  });

  it('estimates past expenditure more accurately than the forward filter', () => {
    const sim = steadyLoss(23);
    const { series, filtered } = estimateExpenditure(sim.observations, options(3100));

    // Seeded 350 kcal high, so the forward pass spends its early history
    // walking down from a wrong number. The backward pass knows better.
    const smoothedError = rmse(
      series.map((s) => s.expenditureKcal),
      sim.trueTdee,
    );
    const filteredError = rmse(
      filtered.map((s) => s.expenditureKcal),
      sim.trueTdee,
    );

    expect(smoothedError).toBeLessThan(filteredError);
  });

  it('leaves the most recent day identical — smoothing sharpens history only', () => {
    const sim = steadyLoss(5);
    const { series, filtered, latest } = estimateExpenditure(sim.observations, options(2750));

    const lastSmoothed = series[series.length - 1];
    const lastFiltered = filtered[filtered.length - 1];

    expect(lastSmoothed.expenditureKcal).toBeCloseTo(lastFiltered.expenditureKcal, 6);
    expect(lastSmoothed.trendWeightKg).toBeCloseTo(lastFiltered.trendWeightKg, 6);
    expect(latest!.expenditureKcal).toBeCloseTo(lastFiltered.expenditureKcal, 6);
  });

  it('places a step change nearer to where it actually happened', () => {
    const sim = simulate({
      startDate: '2026-01-01',
      days: 200,
      startKg: 90,
      tdeeOn: (day) => (day < 100 ? 2900 : 2500),
      intakeOn: () => 2400,
      kcalPerKgTissue: KCAL_PER_KG_TISSUE,
      scaleNoiseSdKg: 0.7,
      seed: 61,
    });

    const { series, filtered } = estimateExpenditure(sim.observations, options(2900));

    // Three weeks after the step, the forward filter is still catching up.
    // The smoother, knowing the months that followed, should be closer.
    const at = 121;
    const smoothedGap = Math.abs(series[at].expenditureKcal - 2500);
    const filteredGap = Math.abs(filtered[at].expenditureKcal - 2500);

    expect(smoothedGap).toBeLessThan(filteredGap);
  });
});

describe('outlier handling', () => {
  it('barely moves the trend for one absurd reading', () => {
    const sim = steadyLoss(31, 90);

    const clean = estimateExpenditure(sim.observations, options(2750));

    // Someone else steps on the scale on day 60: five kilos out of nowhere.
    const corrupted = sim.observations.map((o, i) =>
      i === 60 && typeof o.weightKg === 'number' ? { ...o, weightKg: o.weightKg + 5 } : o,
    );
    const withOutlier = estimateExpenditure(corrupted, options(2750));

    expect(withOutlier.series[60].weightOutlier).toBe(true);

    // The filtered value on that very day is what the outlier could distort.
    const shift = Math.abs(
      withOutlier.filtered[60].trendWeightKg - clean.filtered[60].trendWeightKg,
    );
    expect(shift).toBeLessThan(1);

    // And the final expenditure estimate should be largely unharmed.
    expect(
      Math.abs(withOutlier.latest!.expenditureKcal - clean.latest!.expenditureKcal),
    ).toBeLessThan(120);
  });

  it('does not flag ordinary readings on a clean history', () => {
    const sim = steadyLoss(44, 120);
    const { series } = estimateExpenditure(sim.observations, options(2750));

    // At three sigma, Gaussian noise should trip this a fraction of a time
    // across 120 days. Anything more means the gate is too tight and real
    // data is being discounted.
    const flagged = series.filter((s) => s.weightOutlier).length;
    expect(flagged).toBeLessThanOrEqual(3);
  });

  it('still follows a genuine sustained change rather than suppressing it', () => {
    // A real whoosh: five kilos of water lost over a fortnight, every reading
    // consistent with the last. None of it is an error, and the estimate must
    // end up where the data actually went.
    const sim = simulate({
      startDate: '2026-01-01',
      days: 120,
      startKg: 95,
      tdeeOn: () => 2800,
      intakeOn: (day) => (day >= 40 && day < 54 ? 900 : 2500),
      kcalPerKgTissue: KCAL_PER_KG_TISSUE,
      scaleNoiseSdKg: 0.6,
      seed: 77,
    });

    const { series } = estimateExpenditure(sim.observations, options(2800));
    const finalTrend = series[series.length - 1].trendWeightKg;
    const trueFinal = sim.trueWeightKg[sim.trueWeightKg.length - 1];

    expect(Math.abs(finalTrend - trueFinal)).toBeLessThan(0.8);
  });
});
