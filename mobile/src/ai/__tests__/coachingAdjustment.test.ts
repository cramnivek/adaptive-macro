import { describe, expect, it } from 'vitest';
import { calculateCoachingGoalAdjustment } from '../coachingAdjustment';

describe('calculateCoachingGoalAdjustment', () => {
  const expenditure = 2500;

  describe('weight loss (deficit)', () => {
    const currentGoal = { direction: 'lose' as const, rateKgPerWeek: 0.5 };

    it('eating more (+150 kcal) slows weight loss rate', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal,
        expenditureKcal: expenditure,
        deltaKcal: 150,
      });

      // 150 kcal * 7 / 7700 = ~0.136 kg/week reduction in loss rate
      expect(res.proposedGoal.direction).toBe('lose');
      expect(res.proposedGoal.rateKgPerWeek).toBeLessThan(currentGoal.rateKgPerWeek);
      expect(res.proposedGoal.rateKgPerWeek).toBeCloseTo(0.36, 2);
      expect(res.achievableKcal).toBeGreaterThan(res.currentKcal);
      expect(res.achievableKcal).toBeCloseTo(res.currentKcal + 150, -1);
      expect(res.rateChangeDescription).toContain('0.36 kg/week');
    });

    it('eating less (-150 kcal) steepens weight loss rate', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal,
        expenditureKcal: expenditure,
        deltaKcal: -150,
      });

      expect(res.proposedGoal.direction).toBe('lose');
      expect(res.proposedGoal.rateKgPerWeek).toBeGreaterThan(currentGoal.rateKgPerWeek);
      expect(res.proposedGoal.rateKgPerWeek).toBeCloseTo(0.64, 2);
      expect(res.achievableKcal).toBeLessThan(res.currentKcal);
    });

    it('large calorie increase transitions out of deficit to maintenance or mild gain', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal: { direction: 'lose', rateKgPerWeek: 0.2 },
        expenditureKcal: expenditure,
        deltaKcal: 350,
      });

      // 0.2 kg/week deficit was ~220 kcal. +350 brings it into surplus (~130 kcal -> ~0.12 kg/wk)
      expect(res.proposedGoal.direction).toBe('gain');
      expect(res.proposedGoal.rateKgPerWeek).toBeGreaterThan(0);
    });
  });

  describe('weight gain (surplus)', () => {
    const currentGoal = { direction: 'gain' as const, rateKgPerWeek: 0.25 };

    it('eating more (+150 kcal) increases weight gain rate', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal,
        expenditureKcal: expenditure,
        deltaKcal: 150,
      });

      // 150 * 7 / 7700 = ~0.136 kg/week addition to gain rate
      expect(res.proposedGoal.direction).toBe('gain');
      expect(res.proposedGoal.rateKgPerWeek).toBeGreaterThan(currentGoal.rateKgPerWeek);
      expect(res.proposedGoal.rateKgPerWeek).toBeCloseTo(0.39, 2);
      expect(res.achievableKcal).toBeGreaterThan(res.currentKcal);
      expect(res.achievableKcal).toBeCloseTo(res.currentKcal + 150, -1);
    });

    it('eating less (-150 kcal) slows weight gain rate', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal,
        expenditureKcal: expenditure,
        deltaKcal: -150,
      });

      expect(res.proposedGoal.direction).toBe('gain');
      expect(res.proposedGoal.rateKgPerWeek).toBeLessThan(currentGoal.rateKgPerWeek);
      expect(res.proposedGoal.rateKgPerWeek).toBeCloseTo(0.11, 2);
      expect(res.achievableKcal).toBeLessThan(res.currentKcal);
    });

    it('large calorie cut in surplus transitions to maintenance or deficit', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal: { direction: 'gain', rateKgPerWeek: 0.2 },
        expenditureKcal: expenditure,
        deltaKcal: -350,
      });

      expect(res.proposedGoal.direction).toBe('lose');
      expect(res.proposedGoal.rateKgPerWeek).toBeGreaterThan(0);
    });
  });

  describe('maintenance', () => {
    const currentGoal = { direction: 'maintain' as const, rateKgPerWeek: 0 };

    it('stays in maintenance on negligible delta (<50 kcal)', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal,
        expenditureKcal: expenditure,
        deltaKcal: 25,
      });

      expect(res.proposedGoal.direction).toBe('maintain');
      expect(res.proposedGoal.rateKgPerWeek).toBe(0);
      expect(res.rateChangeDescription).toBe('Weight Maintenance');
    });

    it('shifts to lean gain on substantial positive delta (+150 kcal)', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal,
        expenditureKcal: expenditure,
        deltaKcal: 150,
      });

      expect(res.proposedGoal.direction).toBe('gain');
      expect(res.proposedGoal.rateKgPerWeek).toBeCloseTo(0.14, 2);
      expect(res.achievableKcal).toBeGreaterThan(res.currentKcal);
    });

    it('shifts to fat loss on substantial negative delta (-150 kcal)', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal,
        expenditureKcal: expenditure,
        deltaKcal: -150,
      });

      expect(res.proposedGoal.direction).toBe('lose');
      expect(res.proposedGoal.rateKgPerWeek).toBeCloseTo(0.14, 2);
      expect(res.achievableKcal).toBeLessThan(res.currentKcal);
    });
  });

  describe('guardrails and safety floor', () => {
    it('triggers safety floor when proposed intake falls below 1200 kcal', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal: { direction: 'lose', rateKgPerWeek: 0.3 },
        expenditureKcal: 1400,
        deltaKcal: -300,
      });

      expect(res.isSafetyFloorTriggered).toBe(true);
      expect(res.achievableKcal).toBeGreaterThanOrEqual(1200);
      expect(res.clamps).toContain('calorieFloor');
    });

    it('clamps rate between 0.1 and 1.5 kg/week', () => {
      const res = calculateCoachingGoalAdjustment({
        currentGoal: { direction: 'lose', rateKgPerWeek: 1.4 },
        expenditureKcal: expenditure,
        deltaKcal: -500,
      });

      expect(res.proposedGoal.rateKgPerWeek).toBeLessThanOrEqual(1.5);
    });
  });
});
