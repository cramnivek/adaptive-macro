import type { ISODate } from '@adaptive-macros/engine';

/**
 * What a Health Connect read becomes in the log, kept apart from the native
 * calls so it can be tested.
 *
 * Health Connect is where Android apps share health data; Garmin Connect,
 * among others, copies steps and scale weigh-ins into it. Ascend only reads.
 * Anything typed in by hand wins: a weigh-in already logged for a day is never
 * replaced, and neither is a hand-entered step count. Steps this import wrote
 * before are refreshed, since a day's count keeps growing until it ends.
 */

export interface DaySteps {
  date: ISODate;
  steps: number;
}

export interface DayWeight {
  date: ISODate;
  kg: number;
}

/**
 * Daily totals from Health Connect's per-day aggregate. Each group starts at
 * local midnight, so its date is the start's date. The aggregate, not a sum
 * of records, because a phone and a watch both count the same walk and only
 * the aggregate removes the overlap.
 */
export const stepsByDay = (groups: { startTime: string; steps: number }[]): DaySteps[] =>
  groups
    .map((group) => ({ date: group.startTime.slice(0, 10) as ISODate, steps: Math.round(group.steps) }))
    .filter((day) => day.steps > 0);

/** The last reading of each day, as the one weigh-in the log keeps per day. */
export const weightsByDay = (
  readings: { time: string; kg: number }[],
  dayOf: (iso: string) => string,
): DayWeight[] => {
  const latest = new Map<string, { time: string; kg: number }>();
  for (const reading of readings) {
    if (!(reading.kg > 0)) continue;
    const date = dayOf(reading.time);
    const held = latest.get(date);
    if (!held || reading.time > held.time) latest.set(date, reading);
  }
  return [...latest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, reading]) => ({ date: date as ISODate, kg: reading.kg }));
};

export const planHealthConnectImport = ({
  loggedWeightDates,
  loggedStepSources,
  weights,
  steps,
}: {
  loggedWeightDates: Set<string>;
  loggedStepSources: Map<string, string>;
  weights: DayWeight[];
  steps: DaySteps[];
}): { weights: DayWeight[]; steps: DaySteps[] } => ({
  weights: weights.filter((day) => !loggedWeightDates.has(day.date)),
  steps: steps.filter((day) => {
    const source = loggedStepSources.get(day.date);
    return source === undefined || source === 'health_connect';
  }),
});
