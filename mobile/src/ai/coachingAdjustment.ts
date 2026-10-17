import type { Goal, TargetOptions, TargetClampReason } from '@adaptive-macros/engine';
import { DEFAULT_TARGET_OPTIONS, KCAL_PER_KG_TISSUE, calorieTarget, roundTo } from '@adaptive-macros/engine';

export interface CoachingAdjustmentResult {
  currentGoal: Goal;
  proposedGoal: Goal;
  currentKcal: number;
  proposedKcal: number;
  achievableKcal: number;
  rateChangeDescription: string;
  clamps: TargetClampReason[];
  isClamped: boolean;
  isSafetyFloorTriggered: boolean;
  isValid: boolean;
}

/**
 * Computes goal-aware calorie adjustments for weight loss, maintenance, and weight gain.
 *
 * Grounding & Physics:
 * - 1 kg tissue ~= 7,700 kcal (or options.kcalPerKgTissue)
 * - 1 kg/week rate change ~= 1,100 kcal/day delta
 *
 * Goal-aware Direction Rules:
 * - Weight Loss (deficit):
 *     deltaKcal > 0 (eating MORE)  -> smaller deficit -> DECREASE loss rate (e.g. 0.5 -> 0.35 kg/wk)
 *     deltaKcal < 0 (eating LESS)  -> larger deficit  -> INCREASE loss rate (e.g. 0.5 -> 0.65 kg/wk)
 *     If deficit drops to zero (<=0.05), transition to maintain (0 kg/wk) or mild gain.
 *
 * - Weight Gain (surplus):
 *     deltaKcal > 0 (eating MORE)  -> larger surplus  -> INCREASE gain rate (e.g. 0.25 -> 0.40 kg/wk)
 *     deltaKcal < 0 (eating LESS)  -> smaller surplus -> DECREASE gain rate (e.g. 0.40 -> 0.25 kg/wk)
 *     If surplus drops to zero (<=0.05), transition to maintain (0 kg/wk) or mild loss.
 *
 * - Maintenance:
 *     deltaKcal > +50 kcal -> transition to mild gain
 *     deltaKcal < -50 kcal -> transition to mild loss
 *     deltaKcal within [-50, +50] -> remains maintain
 */
export const calculateCoachingGoalAdjustment = (params: {
  currentGoal: Goal;
  expenditureKcal: number;
  deltaKcal: number;
  targetOptions?: TargetOptions;
}): CoachingAdjustmentResult => {
  const { currentGoal, expenditureKcal, deltaKcal, targetOptions = DEFAULT_TARGET_OPTIONS } = params;
  const kcalPerKg = targetOptions.kcalPerKgTissue ?? KCAL_PER_KG_TISSUE;

  const currentProgram = calorieTarget(expenditureKcal, currentGoal, targetOptions);
  const currentKcal = currentProgram.kcal;
  const rawProposedKcal = currentKcal + deltaKcal;

  let newDirection = currentGoal.direction;
  let newRate = currentGoal.rateKgPerWeek;

  if (currentGoal.direction === 'lose') {
    // Current adjustment is negative (deficit: -rate * kcalPerKg / 7)
    // To add deltaKcal: newAdjustment = currentAdjustment + deltaKcal
    // -newRate * kcalPerKg / 7 = -currentRate * kcalPerKg / 7 + deltaKcal
    // newRate = currentRate - (deltaKcal * 7) / kcalPerKg
    const rateDelta = (deltaKcal * 7) / kcalPerKg;
    const computedRate = currentGoal.rateKgPerWeek - rateDelta;

    if (computedRate <= 0.05) {
      if (computedRate < -0.05) {
        newDirection = 'gain';
        newRate = Math.min(1.5, Math.max(0.1, roundTo(Math.abs(computedRate), 2)));
      } else {
        newDirection = 'maintain';
        newRate = 0;
      }
    } else {
      newDirection = 'lose';
      newRate = Math.min(1.5, Math.max(0.1, roundTo(computedRate, 2)));
    }
  } else if (currentGoal.direction === 'gain') {
    // Current adjustment is positive (surplus: +rate * kcalPerKg / 7)
    // To add deltaKcal: newAdjustment = currentAdjustment + deltaKcal
    // +newRate * kcalPerKg / 7 = +currentRate * kcalPerKg / 7 + deltaKcal
    // newRate = currentRate + (deltaKcal * 7) / kcalPerKg
    const rateDelta = (deltaKcal * 7) / kcalPerKg;
    const computedRate = currentGoal.rateKgPerWeek + rateDelta;

    if (computedRate <= 0.05) {
      if (computedRate < -0.05) {
        newDirection = 'lose';
        newRate = Math.min(1.5, Math.max(0.1, roundTo(Math.abs(computedRate), 2)));
      } else {
        newDirection = 'maintain';
        newRate = 0;
      }
    } else {
      newDirection = 'gain';
      newRate = Math.min(1.5, Math.max(0.1, roundTo(computedRate, 2)));
    }
  } else {
    // Maintenance (direction === 'maintain', rate = 0)
    const rateDelta = Math.abs((deltaKcal * 7) / kcalPerKg);
    if (deltaKcal > 50) {
      newDirection = 'gain';
      newRate = Math.min(1.5, Math.max(0.1, roundTo(rateDelta, 2)));
    } else if (deltaKcal < -50) {
      newDirection = 'lose';
      newRate = Math.min(1.5, Math.max(0.1, roundTo(rateDelta, 2)));
    } else {
      newDirection = 'maintain';
      newRate = 0;
    }
  }

  const proposedGoal: Goal = {
    direction: newDirection,
    rateKgPerWeek: newRate,
  };

  const recalculatedProgram = calorieTarget(expenditureKcal, proposedGoal, targetOptions);
  const isSafetyFloorTriggered =
    recalculatedProgram.kcal <= targetOptions.floorKcal ||
    recalculatedProgram.clamps.includes('calorieFloor') ||
    rawProposedKcal < targetOptions.floorKcal;

  let rateChangeDescription = '';
  if (proposedGoal.direction === 'maintain') {
    rateChangeDescription = 'Weight Maintenance';
  } else if (proposedGoal.direction === 'lose') {
    rateChangeDescription = `Fat Loss (${proposedGoal.rateKgPerWeek} kg/week)`;
  } else {
    rateChangeDescription = `Lean Gain (+${proposedGoal.rateKgPerWeek} kg/week)`;
  }

  return {
    currentGoal,
    proposedGoal,
    currentKcal,
    proposedKcal: roundTo(rawProposedKcal),
    achievableKcal: recalculatedProgram.kcal,
    rateChangeDescription,
    clamps: recalculatedProgram.clamps,
    isClamped: recalculatedProgram.clamps.length > 0,
    isSafetyFloorTriggered,
    isValid: true,
  };
};
