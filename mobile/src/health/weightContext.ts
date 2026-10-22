import type { ISODate, LogEntry } from '@adaptive-macros/engine';
import { addDays } from '@adaptive-macros/engine';

export interface DailySodiumObservation {
  date: ISODate;
  complete: boolean;
  foodCount: number;
  knownSodiumCount: number;
  sodiumMg?: number;
}

export interface WeightContext {
  date: ISODate;
  weightKg: number;
  previousDate: ISODate;
  previousWeightKg: number;
  sodiumDate: ISODate;
  sodiumMg: number;
  baselineSodiumMg: number;
  baselineDates: ISODate[];
}

export const dailySodiumObservations = (
  entries: Pick<LogEntry, 'date' | 'nutrients'>[],
  dayStatus: ReadonlyMap<ISODate, boolean>,
): DailySodiumObservation[] => {
  const days = new Map<ISODate, DailySodiumObservation>();
  for (const entry of entries) {
    const day = days.get(entry.date) ?? {
      date: entry.date, complete: dayStatus.get(entry.date) === true,
      foodCount: 0, knownSodiumCount: 0, sodiumMg: 0,
    };
    day.foodCount++;
    const amount = entry.nutrients.micros?.sodiumMg;
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) {
      day.knownSodiumCount++;
      day.sodiumMg! += amount;
    }
    days.set(entry.date, day);
  }
  return [...days.values()].map((day) => ({
    ...day,
    // A partial sum is not the day's sodium, even when the log is marked complete.
    sodiumMg: day.knownSodiumCount === day.foodCount ? day.sodiumMg : undefined,
  }));
};

const hasKnownSodium = (day: DailySodiumObservation): day is DailySodiumObservation & { sodiumMg: number } =>
  day.complete === true && day.foodCount > 0 && day.knownSodiumCount === day.foodCount &&
  typeof day.sodiumMg === 'number' && Number.isFinite(day.sodiumMg) && day.sodiumMg >= 0;

export const sodiumCoverage = (date: ISODate, sodium: DailySodiumObservation[]): {
  status: 'incomplete' | 'unknown-sodium' | 'baseline' | 'ready'; baselineDays: number;
} => {
  const previousDate = addDays(date, -1);
  const baselineDays = sodium.filter((day) => day.date >= addDays(date, -7) && day.date < previousDate && hasKnownSodium(day)).length;
  const previous = sodium.find((day) => day.date === previousDate);
  if (!previous?.complete || previous.foodCount === 0) return { status: 'incomplete', baselineDays };
  if (!hasKnownSodium(previous)) return { status: 'unknown-sodium', baselineDays };
  return { status: baselineDays < 3 ? 'baseline' : 'ready', baselineDays };
};

/** The mean of recorded days, without filling missing days or blending the two weeks. */
export const weeklyWeightSummary = (date: ISODate, weights: { date: ISODate; kg: number }[]) => {
  const average = (from: ISODate, to: ISODate) => {
    const readings = weights.filter((row) => row.date >= from && row.date <= to && Number.isFinite(row.kg) && row.kg > 0);
    return readings.length ? { kg: readings.reduce((sum, row) => sum + row.kg, 0) / readings.length, readings: readings.length } : null;
  };
  const current = average(addDays(date, -6), date);
  const previous = average(addDays(date, -13), addDays(date, -7));
  return {
    current, previous,
    changeKg: current && previous && current.readings >= 3 && previous.readings >= 3 ? current.kg - previous.kg : null,
  };
};

export const weightContext = (
  date: ISODate,
  weights: { date: ISODate; kg: number }[],
  sodium: DailySodiumObservation[],
): WeightContext | null => {
  const current = weights.find((weight) => weight.date === date);
  const previous = weights
    .filter((weight) => weight.date < date && weight.date >= addDays(date, -3))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!current || !previous || !Number.isFinite(current.kg) || !Number.isFinite(previous.kg) ||
      current.kg <= 0 || previous.kg <= 0) return null;

  // These are display heuristics for a cautious observation, not clinical cutoffs.
  if (current.kg * 1000 < previous.kg * 1005) return null;
  const sodiumDate = addDays(date, -1);
  const preceding = sodium.find((day) => day.date === sodiumDate);
  if (!preceding || !hasKnownSodium(preceding)) return null;
  const baseline = sodium
    .filter((day) => day.date >= addDays(date, -7) && day.date < sodiumDate)
    .filter(hasKnownSodium)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (baseline.length < 3) return null;
  const amounts = baseline.map((day) => day.sodiumMg).sort((a, b) => a - b);
  const middle = Math.floor(amounts.length / 2);
  const baselineSodiumMg = amounts.length % 2 === 0
    ? (amounts[middle - 1] + amounts[middle]) / 2
    : amounts[middle];
  if (preceding.sodiumMg - baselineSodiumMg < 1000) return null;
  return {
    date, weightKg: current.kg, previousDate: previous.date, previousWeightKg: previous.kg,
    sodiumDate, sodiumMg: preceding.sodiumMg, baselineSodiumMg,
    baselineDates: baseline.map((day) => day.date),
  };
};
