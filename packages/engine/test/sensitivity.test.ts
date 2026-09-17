import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_MULTIPLIERS,
  DEFAULT_MODEL_OPTIONS,
  type ExpenditureModelOptions,
  estimateExpenditure,
  mifflinStJeorBmr,
} from '../src/expenditure';
import { gaussian, rng, simulate } from '../src/simulate';
import { KCAL_PER_KG_TISSUE } from '../src/units';

/**
 * How wrong the estimate gets when the model's assumptions are wrong.
 *
 * The other tests check that the filter recovers a known truth when the world
 * behaves exactly as modelled. These check the opposite: what happens when it
 * does not. Every assumption here is an approximation taken from the
 * literature, and the point is to know the size of each one's consequences
 * rather than to pretend they are exact.
 */

const TRUE_TDEE = 2800;
const DAYS = 120;
const START_KG = 85;

const options = (seed: number): ExpenditureModelOptions => ({
  ...DEFAULT_MODEL_OPTIONS,
  initialExpenditureKcal: seed,
});

const history = (spec: { kcalPerKgTissue: number; intake: number; seed?: number }) =>
  simulate({
    startDate: '2026-01-01',
    days: DAYS,
    startKg: START_KG,
    tdeeOn: () => TRUE_TDEE,
    intakeOn: () => spec.intake,
    kcalPerKgTissue: spec.kcalPerKgTissue,
    scaleNoiseSdKg: 0.7,
    seed: spec.seed ?? 11,
  });

describe('tissue energy density being wrong', () => {
  /**
   * The app assumes 7700 kcal per kg of body-mass change. Real tissue is a
   * mix: adipose is near that figure, but glycogen and its bound water are
   * far cheaper, which is why early weight loss is fast and misleading.
   */
  it('biases expenditure in proportion to the rate of weight change', () => {
    const rows: { rhoTrue: number; est: number; predicted: number }[] = [];

    for (const rhoTrue of [5000, 6000, 7700, 9000]) {
      const sim = history({ kcalPerKgTissue: rhoTrue, intake: 2300 });
      const { latest } = estimateExpenditure(sim.observations, options(TRUE_TDEE));

      // Analytically: E_est − E_true = (Δweight per day) × (ρ_true − ρ_assumed)
      const dwPerDay = (2300 - TRUE_TDEE) / rhoTrue;
      const predicted = dwPerDay * (rhoTrue - KCAL_PER_KG_TISSUE);

      rows.push({ rhoTrue, est: latest!.expenditureKcal, predicted });
    }

    console.log('\n  true ρ   est TDEE   error    predicted by theory');
    for (const r of rows) {
      console.log(
        `  ${String(r.rhoTrue).padEnd(8)} ${Math.round(r.est).toString().padEnd(10)} ` +
          `${(r.est - TRUE_TDEE >= 0 ? '+' : '') + Math.round(r.est - TRUE_TDEE)}`.padEnd(9) +
          `${(r.predicted >= 0 ? '+' : '') + Math.round(r.predicted)}`,
      );
    }

    // Correct ρ means no bias from this source at all.
    const exact = rows.find((r) => r.rhoTrue === KCAL_PER_KG_TISSUE)!;
    expect(Math.abs(exact.est - TRUE_TDEE)).toBeLessThan(120);

    // A wrong ρ produces the bias the algebra predicts, and in that direction.
    for (const r of rows) {
      if (r.rhoTrue === KCAL_PER_KG_TISSUE) continue;
      expect(Math.sign(r.est - TRUE_TDEE)).toBe(Math.sign(r.predicted));
      expect(Math.abs(r.est - TRUE_TDEE - r.predicted)).toBeLessThan(150);
    }
  });

  it('costs nothing at maintenance and grows with the deficit', () => {
    const rows: { intake: number; ratePerWeek: number; error: number }[] = [];

    for (const intake of [2800, 2650, 2500, 2300, 2000]) {
      // The world runs on a much lower tissue density than the app assumes,
      // as it does in the first weeks of a diet.
      const sim = history({ kcalPerKgTissue: 6000, intake });
      const { latest } = estimateExpenditure(sim.observations, options(TRUE_TDEE));
      rows.push({
        intake,
        ratePerWeek: ((intake - TRUE_TDEE) / 6000) * 7,
        error: latest!.expenditureKcal - TRUE_TDEE,
      });
    }

    console.log('\n  intake   rate kg/wk   TDEE error');
    for (const r of rows) {
      console.log(
        `  ${String(r.intake).padEnd(8)} ${r.ratePerWeek.toFixed(2).padEnd(12)} ` +
          `${(r.error >= 0 ? '+' : '') + Math.round(r.error)}`,
      );
    }

    // At maintenance there is no weight change for a wrong ρ to mis-price.
    const maintenance = rows.find((r) => r.intake === TRUE_TDEE)!;
    expect(Math.abs(maintenance.error)).toBeLessThan(120);

    // The faster the change, the worse it gets.
    const fastest = rows.find((r) => r.intake === 2000)!;
    expect(Math.abs(fastest.error)).toBeGreaterThan(Math.abs(maintenance.error));
  });
});

describe('intake reported consistently low', () => {
  /**
   * Under-reporting is the best-documented failure in self-reported diet data,
   * and it is the one this design handles best: the same biased instrument
   * sets the target and measures compliance, so the error cancels in the loop
   * even though every individual number is wrong.
   */
  it('biases the estimate but still delivers the intended deficit', () => {
    const trueIntake = 2300;
    const rows: { under: number; est: number; realDeficit: number }[] = [];

    for (const under of [0, 0.1, 0.2]) {
      const sim = history({ kcalPerKgTissue: KCAL_PER_KG_TISSUE, intake: trueIntake });
      const observed = sim.observations.map((o) => ({
        ...o,
        intakeKcal: o.intakeKcal === undefined ? undefined : o.intakeKcal * (1 - under),
      }));

      const { latest } = estimateExpenditure(observed, options(TRUE_TDEE));
      // A 500 kcal deficit as the app measures it...
      const target = latest!.expenditureKcal - 500;
      // ...eaten by someone who under-reports by the same fraction.
      const realIntake = target / (1 - under);

      rows.push({ under, est: latest!.expenditureKcal, realDeficit: TRUE_TDEE - realIntake });
    }

    console.log('\n  under-log   est TDEE   real deficit achieved');
    for (const r of rows) {
      console.log(
        `  ${`${Math.round(r.under * 100)}%`.padEnd(11)} ${Math.round(r.est).toString().padEnd(10)} ` +
          `${Math.round(r.realDeficit)}`,
      );
    }

    // The expenditure estimate is dragged down roughly in proportion...
    expect(rows[2].est).toBeLessThan(rows[0].est - 200);
    // ...yet every case still lands near the 500 kcal deficit that was asked for.
    for (const r of rows) expect(Math.abs(r.realDeficit - 500)).toBeLessThan(150);
  });
});

describe('water weight that persists for days', () => {
  /**
   * The filter treats each scale reading as erring independently. Real water
   * and glycogen shifts persist — a high-carb weekend reads high for days —
   * so the errors are correlated, and clustered readings look like signal.
   */
  it('understates its own uncertainty when noise is correlated', () => {
    const rows: { phi: number; error: number; sd: number }[] = [];

    for (const phi of [0, 0.5, 0.8]) {
      const sim = history({ kcalPerKgTissue: KCAL_PER_KG_TISSUE, intake: 2300 });
      const random = rng(99);
      let carry = 0;

      const observed = sim.observations.map((o, i) => {
        // AR(1): today's water retention is mostly yesterday's plus a shock,
        // scaled to keep the marginal standard deviation at 0.7 kg either way.
        carry = phi * carry + Math.sqrt(1 - phi * phi) * gaussian(random) * 0.7;
        return { ...o, weightKg: sim.trueWeightKg[i] + carry };
      });

      const { latest } = estimateExpenditure(observed, options(TRUE_TDEE));
      rows.push({
        phi,
        error: latest!.expenditureKcal - TRUE_TDEE,
        sd: latest!.expenditureSdKcal,
      });
    }

    console.log('\n  correlation   TDEE error   reported sd   error / sd');
    for (const r of rows) {
      console.log(
        `  ${r.phi.toFixed(1).padEnd(13)} ${((r.error >= 0 ? '+' : '') + Math.round(r.error)).padEnd(12)} ` +
          `${('±' + Math.round(r.sd)).padEnd(13)} ${(Math.abs(r.error) / r.sd).toFixed(2)}×`,
      );
    }

    // The reported uncertainty barely responds to correlation, because the
    // model has no term for it — so a correlated world is more wrong than the
    // app admits. This asserts the limitation exists rather than that it is
    // acceptable.
    const independent = rows[0];
    const correlated = rows[2];
    expect(Math.abs(correlated.error)).toBeGreaterThan(Math.abs(independent.error));
    expect(correlated.sd).toBeLessThan(Math.abs(independent.sd) * 2);
  });
});

describe('the cold-start seed', () => {
  it('is forgotten within a few weeks however wrong it was', () => {
    const rows: { seed: number; at: number[] }[] = [];

    for (const seed of [2200, 2800, 3400]) {
      const sim = history({ kcalPerKgTissue: KCAL_PER_KG_TISSUE, intake: 2300 });
      // The FORWARD pass, deliberately. The smoothed series re-estimates day 7
      // knowing what the next four months held, which is the right number to
      // draw on a chart but the wrong one for "what would I have been told on
      // day 7". Only the filtered pass answers that.
      const { filtered } = estimateExpenditure(sim.observations, options(seed));
      rows.push({
        seed,
        at: [7, 14, 28, 60].map((d) => filtered[Math.min(d, filtered.length - 1)].expenditureKcal),
      });
    }

    const bmr = mifflinStJeorBmr(85, 178, 30, 'male');
    console.log(`\n  Mifflin-St Jeor RMR, 85 kg / 178 cm / 30 M: ${Math.round(bmr)} kcal`);
    console.log(
      '  activity multipliers span: ' +
        Object.entries(ACTIVITY_MULTIPLIERS)
          .map(([k, v]) => `${k} ${Math.round(bmr * v)}`)
          .join('  '),
    );
    console.log('\n  what you would have been told, live, on each day:');
    console.log('  seed     day 7     day 14    day 28    day 60');
    for (const r of rows) {
      console.log(
        `  ${String(r.seed).padEnd(8)} ` + r.at.map((v) => Math.round(v).toString().padEnd(9)).join(''),
      );
    }

    const spreadAt = (i: number) => {
      const values = rows.map((r) => r.at[i]);
      return Math.max(...values) - Math.min(...values);
    };

    // Seeds 1200 kcal apart must converge, and keep converging.
    expect(spreadAt(3)).toBeLessThan(spreadAt(0));
    // By two months the seed should no longer meaningfully determine the answer.
    expect(spreadAt(3)).toBeLessThan(250);
  });
});
