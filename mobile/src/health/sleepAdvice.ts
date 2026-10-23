import { addDays } from '@adaptive-macros/engine';
import type { SleepSummary } from './sleep';

/** CDC duration references are a guide to recorded time, never a sleep-quality score. */
export const sleepAdvice = (selected: SleepSummary | undefined, nights: SleepSummary[], age: number) => {
  const minimumMinutes = Number.isFinite(age) && age >= 13 ? (age < 18 ? 480 : 420) : null;
  const valid = (night: SleepSummary) => night.sleepMinutes !== null && Number.isFinite(night.sleepMinutes) &&
    night.sleepMinutes >= 0 && night.sleepMinutes <= night.sessionMinutes;
  const covered = (night: SleepSummary) => valid(night) && night.sessionMinutes > 0 && night.fullyObserved === true;
  const recentNights = selected ? nights.filter((night) => night.date >= addDays(selected.date, -6) && night.date <= selected.date && covered(night)) : [];
  const recent = minimumMinutes !== null && recentNights.length >= 3 ? {
    nights: recentNights.length,
    averageMinutes: Math.round(recentNights.reduce((sum, night) => sum + night.sleepMinutes!, 0) / recentNights.length),
    shortNights: recentNights.filter((night) => night.sleepMinutes! < minimumMinutes).length,
  } : null;
  const state = !selected ? 'missing' : minimumMinutes === null || !valid(selected) ? 'unknown'
    : selected.sleepMinutes! >= minimumMinutes ? 'enough' : covered(selected) ? 'short' : 'unknown';
  const title = state === 'enough' ? 'Enough sleep time recorded'
    : state === 'short' ? 'Less sleep recorded'
      : state === 'missing' ? 'No sleep recorded for this day' : 'Not enough detail to assess sleep';
  const action = state === 'short' || (state === 'enough' && recent && recent.shortNights > recent.nights / 2)
    ? `Give yourself more time for sleep tonight; aim for at least ${minimumMinutes! / 60} hours.`
    : state === 'enough' ? 'Keep a consistent bedtime tonight. How rested you feel matters too.'
      : minimumMinutes === null ? 'Review your age in Settings to see a sleep-duration guide.'
        : 'Sync your tracker to check for missing sleep data.';
  return { state, title, action, minimumMinutes, recent };
};
