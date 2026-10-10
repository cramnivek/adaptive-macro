import type { Goal, WeeklyCheckIn } from '@adaptive-macros/engine';
import { formatDayMonth, formatWeight } from './format';
import type { UnitSystem } from './state/settings';

/**
 * The words on the weekly check-in.
 *
 * It leads with the target, because that is the number the person acts on,
 * and gives the reason straight after it. Changes under 25 kcal are reported
 * as holding: a target that "rises by 8" is noise dressed as news.
 */

const STEADY_KCAL = 25;

const kcal = (value: number) => Math.round(value).toLocaleString('en-US');

export interface CheckInCopy {
  week: string;
  headline: string;
  reason: string;
  logged: string;
  weight: string;
  /** Present only when the week was too thin for the estimate to learn much. */
  nudge: string | null;
}

const goalText = (goal: Goal, units: UnitSystem): string => {
  if (goal.direction === 'maintain') return 'goal: hold steady';
  const sign = goal.direction === 'lose' ? '−' : '+';
  return `goal ${sign}${formatWeight(goal.rateKgPerWeek, units)} a week`;
};

const signedWeight = (kg: number, units: UnitSystem): string =>
  `${kg < 0 ? '−' : '+'}${formatWeight(Math.abs(kg), units)}`;

export const checkInCopy = (checkIn: WeeklyCheckIn, goal: Goal, units: UnitSystem): CheckInCopy => {
  const targetDelta = checkIn.targetNowKcal - checkIn.targetThenKcal;
  const expenditureDelta = checkIn.expenditureNowKcal - checkIn.expenditureThenKcal;

  const headline =
    Math.abs(targetDelta) < STEADY_KCAL
      ? `Your target holds at ${kcal(checkIn.targetNowKcal)} kcal.`
      : `Your target ${targetDelta > 0 ? 'rises' : 'drops'} by ${kcal(Math.abs(targetDelta))} to ${kcal(checkIn.targetNowKcal)} kcal.`;

  const reason =
    Math.abs(expenditureDelta) < STEADY_KCAL
      ? `Your expenditure estimate held at about ${kcal(checkIn.expenditureNowKcal)} kcal.`
      : `Your expenditure estimate moved from ${kcal(checkIn.expenditureThenKcal)} to ${kcal(checkIn.expenditureNowKcal)} kcal.`;

  const logged =
    checkIn.daysCounted === 0 || checkIn.averageIntakeKcal === null
      ? 'No days counted towards the estimate.'
      : `${checkIn.daysCounted} of 7 days counted, averaging ${kcal(checkIn.averageIntakeKcal)} kcal.`;

  const weight =
    checkIn.trendChangeKg === null
      ? 'No weigh-ins, so no weight trend for the week.'
      : `Weight trend ${signedWeight(checkIn.trendChangeKg, units)} (${goalText(goal, units)}).`;

  // Fewer than five logged days, or a couple of weigh-ins, leaves the filter
  // mostly predicting; saying so is how the next week gets better data.
  const nudge =
    checkIn.daysCounted < 5 || checkIn.weighIns < 3
      ? 'Log food on five days and weigh in on three, and the estimate settles faster.'
      : null;

  return {
    week: `${formatDayMonth(checkIn.weekStart)} – ${formatDayMonth(checkIn.weekEnd)}`,
    headline,
    reason,
    logged,
    weight,
    nudge,
  };
};
