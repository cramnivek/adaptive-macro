import { describe, expect, it } from 'vitest';
import { paceForGoal } from '../targets.ts';

describe('paceForGoal', () => {
  it('spreads the change over the weeks asked for', () => {
    expect(paceForGoal(80, 75, 12)).toEqual({ direction: 'lose', rateKgPerWeek: 0.42, capped: false, weeks: 12 });
    expect(paceForGoal(70, 73, 24)).toEqual({ direction: 'gain', rateKgPerWeek: 0.13, capped: false, weeks: 24 });
  });

  it('holds loss to 1% of body weight a week and says how long it really takes', () => {
    // 10 kg in 8 weeks from 80 kg would be 1.25 kg a week; 0.8 is the limit.
    expect(paceForGoal(80, 70, 8)).toEqual({ direction: 'lose', rateKgPerWeek: 0.8, capped: true, weeks: 13 });
  });

  it('holds gain to half a percent a week', () => {
    expect(paceForGoal(70, 76, 8)).toEqual({ direction: 'gain', rateKgPerWeek: 0.35, capped: true, weeks: 18 });
  });

  it('treats a goal within a quarter kilo as maintaining', () => {
    expect(paceForGoal(75, 75.1, 12).direction).toBe('maintain');
  });
});
