import { kgToLb, lbToKg, roundTo } from '@adaptive-macros/engine';
import type { UnitSystem } from './state/settings';

export const weightUnit = (units: UnitSystem): string => (units === 'metric' ? 'kg' : 'lb');

/** Converts a stored kg value into the user's display unit. */
export const displayWeight = (kg: number, units: UnitSystem): number =>
  units === 'metric' ? kg : kgToLb(kg);

export const formatWeight = (kg: number, units: UnitSystem, decimals = 1): string =>
  `${displayWeight(kg, units).toFixed(decimals)} ${weightUnit(units)}`;

/**
 * Parses a weight the user typed, in whatever unit they are shown, back to kg.
 *
 * Returns null rather than NaN or 0 for unparseable input: a silent 0 would be
 * stored as a real weigh-in and wreck the trend.
 */
export const parseWeight = (text: string, units: UnitSystem): number | null => {
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return units === 'metric' ? value : lbToKg(value);
};

export const formatRate = (kgPerWeek: number, units: UnitSystem): string => {
  const value = units === 'metric' ? kgPerWeek : kgToLb(kgPerWeek);
  const sign = value > 0 ? '+' : '';
  return `${sign}${roundTo(value, 2)} ${weightUnit(units)}/wk`;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed 17 Sep" — parsed as UTC to match how dates are stored and compared. */
export const formatDate = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};

export const formatDateLong = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

export const MEAL_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
} as const;
