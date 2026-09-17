import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_OPTIONS,
  type ExpenditureModelOptions,
  estimateExpenditure,
  expenditureConfidence,
  mifflinStJeorBmr,
  seedExpenditure,
} from '../src/expenditure.js';
import { KCAL_PER_KG_TISSUE } from '../src/units.js';
import { rmse, simulate } from './helpers.js';

const options = (initialExpenditureKcal: number): ExpenditureModelOptions => ({
  ...DEFAULT_MODEL_OPTIONS,
  initialExpenditureKcal,
});

describe('estimateExpenditure', () => {
  it('recovers a constant true TDEE from noisy weigh-ins', () => {
    const { observations } = simulate({
      startDate: '2026-01-01',
      days: 120,
      startKg: 85,
      tdeeOn: () => 2800,
      intakeOn: () => 2300,
      kcalPerKgTissue: KCAL_PER_KG_TISSUE,
      scaleNoiseSdKg: 0.7,
      seed: 42,
    });

    // Seeded 400 kcal too high on purpose: the point is that the data, not the
    // seed, determines where it ends up.
    const { latest } = estimateExpenditure(observations, options(3200));

    expect(latest).not.toBeNull();
    expect(latest!.expenditureKcal).toBeGreaterThan(2650);
    expect(latest!.expenditureKcal).toBeLessThan(2950);
    expect(latest!.expenditureSdKcal).toBeLessThan(150);
  });

  it('is not fooled by a seed that is far too low either', () => {
    const { observations } = simulate({
      startDate: '2026-01-01',
      days: 120,
      startKg: 85,
      tdeeOn: () => 2800,
      intakeOn: () => 2300,
      kcalPerKgTissue: KCAL_PER_KG_TISSUE,
      scaleNoiseSdKg: 0.7,
      seed: 7,
    });

    const { latest } = estimateExpenditure(observations, options(2200));
    expect(Math.abs(latest!.expenditureKcal - 2800)).toBeLessThan(200);
  });

  it('adapts when true expenditure steps down mid-history', () => {
    const { observations } = simulate({
      startDate: '2026-01-01',
      days: 220,
      startKg: 90,
      tdeeOn: (day) => (day < 110 ? 2900 : 2500),
      intakeOn: () => 2400,
      kcalPerKgTissue: KCAL_PER_KG_TISSUE,
      scaleNoiseSdKg: 0.7,
      seed: 99,
    });

    const { series, latest } = estimateExpenditure(observations, options(2900));

    const beforeStep = series[100].expenditureKcal;
    expect(Math.abs(beforeStep - 2900)).toBeLessThan(220);
    expect(Math.abs(latest!.expenditureKcal - 2500)).toBeLessThan(220);
  });

  it('smooths scale noise: the trend tracks true weight better than raw readings', () => {
    const sim = simulate({
      startDate: '2026-01-01',
      days: 90,
      startKg: 78,
      tdeeOn: () => 2600,
      intakeOn: () => 2200,
      kcalPerKgTissue: KCAL_PER_KG_TISSUE,
      scaleNoiseSdKg: 0.9,
      seed: 5,
    });

    const { series } = estimateExpenditure(sim.observations, options(2600));

    const rawReadings = sim.observations.map((o) => o.weightKg as number);
    const trend = series.map((s) => s.trendWeightKg);

    const rawError = rmse(rawReadings, sim.trueWeightKg);
    const trendError = rmse(trend, sim.trueWeightKg);

    expect(trendError).toBeLessThan(rawError * 0.5);
  });

  it('survives sporadic weigh-ins and widens uncertainty across the gap', () => {
    const { observations } = simulate({
      startDate: '2026-01-01',
      days: 120,
      startKg: 82,
      tdeeOn: () => 2700,
      intakeOn: () => 2300,
      kcalPerKgTissue: KCAL_PER_KG_TISSUE,
      scaleNoiseSdKg: 0.7,
      seed: 11,
      // A three-week stretch with no weigh-ins, in the middle of the history.
      skipWeightOn: (day) => day >= 40 && day < 61,
    });

    const { series, latest } = estimateExpenditure(observations, options(2700));

    const beforeGap = series[39].trendWeightSdKg;
    const endOfGap = series[60].trendWeightSdKg;
    expect(endOfGap).toBeGreaterThan(beforeGap);

    expect(series.every((s) => Number.isFinite(s.expenditureKcal))).toBe(true);
    expect(Math.abs(latest!.expenditureKcal - 2700)).toBeLessThan(250);
  });

  it('treats unlogged days as missing information rather than zero intake', () => {
    const spec = {
      startDate: '2026-01-01',
      days: 120,
      startKg: 82,
      tdeeOn: () => 2700,
      intakeOn: () => 2300,
      kcalPerKgTissue: KCAL_PER_KG_TISSUE,
      scaleNoiseSdKg: 0.7,
      seed: 3,
    } as const;

    const full = estimateExpenditure(simulate(spec).observations, options(2700));
    const patchy = estimateExpenditure(
      // Every Saturday and Sunday unlogged, which is the realistic failure mode.
      simulate({ ...spec, skipIntakeOn: (day) => day % 7 >= 5 }).observations,
      options(2700),
    );

    expect(Math.abs(patchy.latest!.expenditureKcal - 2700)).toBeLessThan(300);
    // Less evidence must mean more uncertainty, never silently equal confidence.
    expect(patchy.latest!.expenditureSdKcal).toBeGreaterThan(
      full.latest!.expenditureSdKcal,
    );
  });

  it('returns an empty result when there is no weight data to anchor on', () => {
    const result = estimateExpenditure(
      [
        { date: '2026-01-01', intakeKcal: 2000 },
        { date: '2026-01-02', intakeKcal: 2100 },
      ],
      options(2500),
    );
    expect(result.series).toEqual([]);
    expect(result.latest).toBeNull();
  });

  it('starts the series at the first weigh-in, ignoring earlier intake-only days', () => {
    const result = estimateExpenditure(
      [
        { date: '2026-01-01', intakeKcal: 2000 },
        { date: '2026-01-02', intakeKcal: 2000 },
        { date: '2026-01-03', weightKg: 80, intakeKcal: 2000 },
        { date: '2026-01-04', weightKg: 79.9, intakeKcal: 2000 },
      ],
      options(2500),
    );
    expect(result.series.map((s) => s.date)).toEqual(['2026-01-03', '2026-01-04']);
  });

  it('accepts observations supplied out of order', () => {
    const ordered = estimateExpenditure(
      [
        { date: '2026-01-01', weightKg: 80, intakeKcal: 2000 },
        { date: '2026-01-02', weightKg: 79.8, intakeKcal: 2000 },
        { date: '2026-01-03', weightKg: 79.7, intakeKcal: 2000 },
      ],
      options(2500),
    );
    const shuffled = estimateExpenditure(
      [
        { date: '2026-01-03', weightKg: 79.7, intakeKcal: 2000 },
        { date: '2026-01-01', weightKg: 80, intakeKcal: 2000 },
        { date: '2026-01-02', weightKg: 79.8, intakeKcal: 2000 },
      ],
      options(2500),
    );
    expect(shuffled.latest!.expenditureKcal).toBeCloseTo(ordered.latest!.expenditureKcal, 6);
  });

  it('never reports an expenditure below the configured floor', () => {
    // Intake far above expenditure while weight somehow falls is contradictory
    // data; the filter must degrade to the floor rather than to nonsense.
    const observations = Array.from({ length: 60 }, (_, day) => ({
      date: `2026-03-${String(day + 1).padStart(2, '0')}`,
      weightKg: 90 + day * 0.2,
      intakeKcal: 1200,
    })).slice(0, 31);

    const { series } = estimateExpenditure(observations, options(2500));
    expect(series.every((s) => s.expenditureKcal >= DEFAULT_MODEL_OPTIONS.minExpenditureKcal)).toBe(
      true,
    );
  });
});

describe('cold start', () => {
  it('matches published Mifflin-St Jeor values', () => {
    // 80 kg, 180 cm, 30 y male: 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(mifflinStJeorBmr(80, 180, 30, 'male')).toBeCloseTo(1780, 6);
    // 65 kg, 165 cm, 30 y female: 650 + 1031.25 - 150 - 161 = 1370.25
    expect(mifflinStJeorBmr(65, 165, 30, 'female')).toBeCloseTo(1370.25, 6);
  });

  it('scales the seed by activity level', () => {
    const profile = { sex: 'male', age: 30, heightCm: 180 } as const;
    expect(seedExpenditure(profile, 80, 'sedentary')).toBeCloseTo(1780 * 1.2, 6);
    expect(seedExpenditure(profile, 80, 'moderate')).toBeCloseTo(1780 * 1.55, 6);
  });
});

describe('expenditureConfidence', () => {
  it('maps uncertainty onto usable buckets', () => {
    expect(expenditureConfidence(400)).toBe('insufficient');
    expect(expenditureConfidence(200)).toBe('low');
    expect(expenditureConfidence(100)).toBe('moderate');
    expect(expenditureConfidence(40)).toBe('high');
  });
});
