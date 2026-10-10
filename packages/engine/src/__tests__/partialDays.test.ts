import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_OPTIONS, estimateExpenditure } from '../expenditure.ts';
import { simulate } from '../simulate.ts';

/**
 * Why the app lets a day be marked as not fully logged.
 *
 * Six weeks eating 2000 against a true 2500, with four days where only 800
 * made it into the log. Read as complete, those days are a deficit the scale
 * never showed, and the only way the filter can explain that is a lower
 * expenditure. Left out, the filter treats them as unknown and recovers the
 * truth. The averages are over seeds, so one lucky noise draw cannot pass it.
 */
const TRUE_TDEE = 2500;
const PARTIAL = new Set([6, 15, 23, 34]);

const meanLatest = (treat: (o: { date: string; weightKg?: number; intakeKcal?: number }, day: number) => object) => {
  let total = 0;
  const seeds = 12;
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = simulate({
      startDate: '2026-08-01',
      days: 42,
      startKg: 85,
      tdeeOn: () => TRUE_TDEE,
      intakeOn: () => 2000,
      kcalPerKgTissue: 7700,
      scaleNoiseSdKg: 0.7,
      seed,
    });
    const observations = sim.observations.map((o, day) => (PARTIAL.has(day) ? treat(o, day) : o));
    const result = estimateExpenditure(observations as typeof sim.observations, {
      ...DEFAULT_MODEL_OPTIONS,
      kcalPerKgTissue: 7700,
      initialExpenditureKcal: 2300,
    });
    total += result.latest!.expenditureKcal;
  }
  return total / seeds;
};

describe('partly logged days', () => {
  it('pull the expenditure estimate down when read as complete', () => {
    const biased = meanLatest((o) => ({ ...o, intakeKcal: 800 }));
    expect(TRUE_TDEE - biased).toBeGreaterThan(80);
  });

  it('do no harm once left out of the estimate', () => {
    const excluded = meanLatest((o) => ({ date: o.date, weightKg: o.weightKg }));
    expect(Math.abs(excluded - TRUE_TDEE)).toBeLessThan(40);
  });
});
