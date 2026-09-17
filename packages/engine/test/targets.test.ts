import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TARGET_OPTIONS,
  buildProgram,
  calorieTarget,
  macroTargets,
} from '../src/targets';
import { KCAL_PER_G, KCAL_PER_KG_TISSUE } from '../src/units';

describe('calorieTarget', () => {
  it('converts a goal rate into a deficit via tissue energy density', () => {
    const target = calorieTarget(2800, { direction: 'lose', rateKgPerWeek: 0.5 });
    // 0.5 kg/wk * 7700 kcal/kg / 7 days = 550 kcal/day
    expect(target.adjustmentKcal).toBe(-550);
    expect(target.kcal).toBe(2250);
    expect(target.achievableRateKgPerWeek).toBeCloseTo(-0.5, 3);
    expect(target.clamps).toEqual([]);
  });

  it('adds a surplus for a gaining goal', () => {
    const target = calorieTarget(2800, { direction: 'gain', rateKgPerWeek: 0.25 });
    expect(target.adjustmentKcal).toBe(275);
    expect(target.kcal).toBe(3075);
  });

  it('returns maintenance calories for a maintain goal', () => {
    const target = calorieTarget(2800, { direction: 'maintain', rateKgPerWeek: 1 });
    expect(target.kcal).toBe(2800);
    expect(target.adjustmentKcal).toBe(0);
  });

  it('caps an unrealistic deficit and reports the rate actually achievable', () => {
    // 1.5 kg/wk asks for 1650 kcal/day, far past 25% of a 2400 expenditure.
    const target = calorieTarget(2400, { direction: 'lose', rateKgPerWeek: 1.5 });
    expect(target.clamps).toContain('deficitCapped');
    expect(target.kcal).toBe(1800);
    expect(target.achievableRateKgPerWeek).toBeCloseTo((-600 * 7) / KCAL_PER_KG_TISSUE, 3);
    expect(Math.abs(target.achievableRateKgPerWeek)).toBeLessThan(1.5);
  });

  it('respects the absolute calorie floor', () => {
    const target = calorieTarget(1400, { direction: 'lose', rateKgPerWeek: 1 });
    expect(target.kcal).toBe(DEFAULT_TARGET_OPTIONS.floorKcal);
    expect(target.clamps).toContain('calorieFloor');
  });
});

describe('macroTargets', () => {
  it('hits the calorie target with macros that add up', () => {
    const macros = macroTargets(2250, 85);
    const implied =
      macros.proteinG * KCAL_PER_G.protein +
      macros.carbsG * KCAL_PER_G.carbs +
      macros.fatG * KCAL_PER_G.fat;
    // Macros are reported in whole grams, so the implied total can drift by up
    // to ~9 kcal from the target. That is rounding, not a maths error.
    expect(Math.abs(implied - 2250)).toBeLessThan(10);
    expect(macros.split.protein + macros.split.carbs + macros.split.fat).toBeCloseTo(100, 0);
  });

  it('sets protein from bodyweight', () => {
    expect(macroTargets(2250, 85).proteinG).toBe(Math.round(1.8 * 85));
  });

  it('honours the fat floor when calories are very low', () => {
    const macros = macroTargets(1200, 110);
    expect(macros.fatG).toBeGreaterThanOrEqual(Math.round(0.6 * 110) - 1);
    expect(macros.carbsG).toBeGreaterThanOrEqual(0);
  });

  it('caps protein rather than letting it crowd out the whole budget', () => {
    // 1.8 g/kg of 120 kg is 216 g, which alone is 72% of a 1200 kcal budget.
    const macros = macroTargets(1200, 120);
    expect(macros.proteinG * KCAL_PER_G.protein).toBeLessThanOrEqual(1200 * 0.4 + 1);
    expect(macros.proteinG).toBeLessThan(1.8 * 120);
  });

  it('shrinks the floors to fit when they exceed the whole budget', () => {
    // 120 g capped protein (480 kcal) plus a 90 g fat floor (810 kcal) is
    // 1290 kcal against a 1200 kcal target.
    const macros = macroTargets(1200, 150);
    expect(macros.clamps).toContain('macroFloorsExceedBudget');
    expect(macros.carbsG).toBe(0);
    const implied =
      macros.proteinG * KCAL_PER_G.protein +
      macros.carbsG * KCAL_PER_G.carbs +
      macros.fatG * KCAL_PER_G.fat;
    expect(Math.abs(implied - 1200)).toBeLessThan(10);
  });

  it('never returns negative carbohydrate', () => {
    for (const kcal of [1200, 1400, 1600, 2000, 3000]) {
      for (const weight of [50, 85, 120, 160]) {
        expect(macroTargets(kcal, weight).carbsG).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('buildProgram', () => {
  it('threads expenditure and goal through to a full day plan', () => {
    const program = buildProgram(2800, 85, { direction: 'lose', rateKgPerWeek: 0.5 });
    expect(program.calories.kcal).toBe(2250);
    expect(program.macros.proteinG).toBe(153);
    expect(program.expenditureKcal).toBe(2800);
  });
});
