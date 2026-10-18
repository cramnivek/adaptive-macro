import { kgToLb, lbToKg, roundTo } from '@adaptive-macros/engine';
import type { UnitSystem } from './state/settings';

export const weightUnit = (units: UnitSystem): string => (units === 'metric' ? 'kg' : 'lb');

/** Converts a stored kg value into the user's display unit. */
export const displayWeight = (kg: number, units: UnitSystem): number =>
  units === 'metric' ? kg : kgToLb(kg);

/**
 * Rounds a weight value to realistic gym plate increments:
 * - Metric: nearest 1.25 kg (smallest standard Olympic change plate).
 * - Imperial: nearest 2.5 lb (smallest standard Olympic plate).
 */
export const roundToPlateIncrement = (weight: number, units: UnitSystem): number => {
  const step = units === 'metric' ? 1.25 : 2.5;
  return Math.round(weight / step) * step;
};

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

/**
 * Day and month, for a chart axis: "2 Oct".
 *
 * No weekday and no year. An axis has room for a few characters, and the
 * weekday is the least useful part of a date you are reading a trend against —
 * two labels ninety days apart both reading "Fri" say nothing at all.
 */
export const formatDayMonth = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
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

/**
 * How many decimals an axis needs to tell its own labels apart.
 *
 * A trend weight that moves 200 g across the window gets ticks a few grams
 * apart, and one decimal renders them all as "75.0" — an axis of four
 * identical numbers, which looks broken rather than precise. Scaled to the
 * span rather than fixed, because the same chart holds a 200 g week and a
 * 15 kg year.
 */
export const axisDecimals = (span: number): number => {
  if (!Number.isFinite(span) || span <= 0) return 1;
  if (span >= 20) return 0;
  if (span >= 2) return 1;
  return 2;
};

export const formatTimeAgo = (isoOrDate: string | Date): string => {
  const date =
    typeof isoOrDate === 'string'
      ? new Date(isoOrDate.includes('T') ? isoOrDate : `${isoOrDate}T12:00:00Z`)
      : isoOrDate;
  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
};
