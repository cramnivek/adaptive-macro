import type { MonthlyExtractedMetrics } from './ai/monthlyReview';
import type { WeeklyExtractedMetrics } from './ai/weeklyReview';
import { formatDateLong, formatWeight } from './format';
import type { UnitSystem } from './state/settings';

export type CheckInRecapMetrics = WeeklyExtractedMetrics | MonthlyExtractedMetrics;
export type CheckInRecapChapterKind = 'period' | 'food' | 'body' | 'training' | 'next';

export interface CheckInRecapChapter {
  kind: CheckInRecapChapterKind;
  title: string;
  value: string;
  label: string;
  detail: string;
}

export interface CheckInRecapModel {
  periodLabel: 'YOUR WEEK' | 'YOUR MONTH' | 'YOUR QUARTER';
  chapters: [
    CheckInRecapChapter,
    CheckInRecapChapter,
    CheckInRecapChapter,
    CheckInRecapChapter,
    CheckInRecapChapter,
  ];
}

export const buildCheckInRecap = (
  metrics: CheckInRecapMetrics,
  units: UnitSystem,
  nextStep: string,
  weightReadings?: readonly { date: string; kg: number }[],
): CheckInRecapModel => {
  const isWeekly = !('weeks' in metrics);
  const weeks = isWeekly ? 1 : metrics.weeks;
  const days = weeks * 7;
  const periodLabel = isWeekly ? 'YOUR WEEK' : weeks >= 13 ? 'YOUR QUARTER' : 'YOUR MONTH';
  const averageCalories = metrics.nutrition.avgCalories;
  const calories = averageCalories !== null && Number.isFinite(averageCalories) ? Math.round(averageCalories) : null;
  const loggedDays = isWeekly ? metrics.nutrition.loggedDays : metrics.nutrition.totalLoggedDays;
  const periodWeights = weightReadings?.filter(
    (reading) => reading.date >= metrics.period.from && reading.date <= metrics.period.to && Number.isFinite(reading.kg),
  ).sort((a, b) => a.date.localeCompare(b.date));
  const measuredReadings = periodWeights ?? [];
  const measuredAverage = periodWeights && periodWeights.length > 0
    ? Math.round((periodWeights.reduce((total, reading) => total + reading.kg, 0) / periodWeights.length) * 10) / 10
    : null;
  const measuredChange = periodWeights && periodWeights.length > 1
    ? Math.round((periodWeights[periodWeights.length - 1].kg - periodWeights[0].kg) * 10) / 10
    : null;
  const averageWeight = weightReadings === undefined
    ? metrics.weight.avgWeightKg !== null && Number.isFinite(metrics.weight.avgWeightKg) ? metrics.weight.avgWeightKg : null
    : measuredAverage;
  const weightChange = weightReadings === undefined
    ? metrics.weight.deltaKg !== null && Number.isFinite(metrics.weight.deltaKg) ? metrics.weight.deltaKg : null
    : measuredChange;
  const sessions = isWeekly ? metrics.training.sessionsCount : metrics.training.totalSessions;
  const workingSets = metrics.training.totalWorkingSets;
  const nextStepText = nextStep.trim();
  const calorieLabel = calories === null ? 'AVERAGE INTAKE' : 'AVG KCAL / LOGGED DAY';
  const foodDetail = calories === null
    ? loggedDays === 0
      ? 'No food was logged in this period.'
      : 'Food averages are unavailable for this period.'
    : `Food logged ${loggedDays} of ${days} days.`;
  const bodyDetail = weightReadings === undefined
    ? averageWeight === null
      ? 'No weight estimate is available for this period.'
      : weightChange === null
        ? 'Estimated trend weight is available; its change is not available.'
        : `Estimated trend weight changed ${weightChange > 0 ? '+' : ''}${formatWeight(weightChange, units)}.`
    : averageWeight === null
      ? 'No weigh-ins were recorded in this period.'
    : measuredReadings.length === 1
        ? 'Average from 1 weigh-in; change needs more than one reading.'
      : `Scale weight changed ${weightChange! > 0 ? '+' : ''}${formatWeight(weightChange!, units)} across ${measuredReadings.length} weigh-ins.`;
  const trainingDetail =
    sessions === 0
      ? 'No training sessions were logged in this period.'
      : `${sessions} ${sessions === 1 ? 'training session' : 'training sessions'} recorded.`;

  return {
    periodLabel,
    chapters: [
      {
        kind: 'period',
        title: periodLabel,
        value: String(sessions),
        label: sessions === 1 ? 'WORKOUT RECORDED' : 'WORKOUTS RECORDED',
        detail: `${formatDateLong(metrics.period.from)} – ${formatDateLong(metrics.period.to)} · ${days} days · Food logged ${loggedDays} of ${days} days`,
      },
      {
        kind: 'food',
        title: 'FOOD',
        value: calories === null ? '—' : calories.toLocaleString(),
        label: calorieLabel,
        detail: foodDetail,
      },
      {
        kind: 'body',
        title: 'BODY',
        value: averageWeight === null ? '—' : formatWeight(averageWeight, units),
        label: weightReadings === undefined ? 'WEIGHT ESTIMATE' : 'AVERAGE WEIGH-IN',
        detail: bodyDetail,
      },
      {
        kind: 'training',
        title: 'TRAINING',
        value: String(workingSets),
        label: 'WORKING SETS',
        detail: trainingDetail,
      },
      {
        kind: 'next',
        title: 'NEXT PERIOD',
        value: nextStepText,
        label: 'RECOMMENDED NEXT STEP',
        detail: 'Read the full review and choose whether to apply its recommendation.',
      },
    ],
  };
};
