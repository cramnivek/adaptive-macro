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
  loggedSteps,
  weights,
  steps,
}: {
  loggedWeightDates: Set<string>;
  /** Steps already in the log, by day: where they came from and the count. */
  loggedSteps: Map<string, { source: string; steps: number }>;
  weights: DayWeight[];
  steps: DaySteps[];
}): { weights: DayWeight[]; steps: DaySteps[] } => ({
  weights: weights.filter((day) => !loggedWeightDates.has(day.date)),
  steps: steps.filter((day) => {
    const logged = loggedSteps.get(day.date);
    if (logged === undefined) return true;
    // Refreshed only when the count moved, so a sync can say how many days it
    // actually changed rather than rewriting the whole history every time.
    return logged.source === 'health_connect' && logged.steps !== day.steps;
  }),
});

export interface HealthConnectSyncResult {
  stepDays: number;
  weighIns: number;
  /** Weigh-ins found but left alone, because the day already had one. */
  weighInsKept: number;
  /**
   * What Health Connect held, before anything was kept or skipped, and which
   * apps wrote it. A sync that saved nothing reads the same whether Health
   * Connect was empty or everything in it was already logged; these say which.
   */
  found: { stepDays: number; weighIns: number; sources: string[]; firstDay: string | null };
}

/**
 * What a sync did, in words, with where to look. The first version said only
 * how many rows it added, so a sync that worked and one that found nothing
 * looked alike, and neither said where the data had gone.
 */
export const describeSync = (result: HealthConnectSyncResult): { title: string; message: string } => {
  const { found } = result;
  if (found.stepDays === 0 && found.weighIns === 0) {
    // Nothing to read is not a failed sync. The usual cause is outside this
    // app: the source app is not sharing into Health Connect yet.
    return {
      title: 'Health Connect has no steps or weigh-ins yet',
      message:
        'Check that Garmin Connect (or your other app) shares steps and weight with Health Connect in its own settings, then sync again.',
    };
  }
  const from = found.sources.length > 0 ? ` from ${found.sources.join(', ')}` : '';
  const since = found.firstDay ? ` back to ${found.firstDay}` : '';
  const kept = result.weighInsKept > 0 ? ` ${result.weighInsKept} days already had a weigh-in and kept it.` : '';
  if (result.stepDays === 0 && result.weighIns === 0) {
    return {
      title: 'Already up to date',
      message: `Found ${found.weighIns} weigh-ins and ${found.stepDays} days of steps${from}, all already in your log.${kept}`,
    };
  }
  return {
    title: 'Health Connect synced',
    message:
      `Found ${found.weighIns} weigh-ins and ${found.stepDays} days of steps${from}${since}. ` +
      `Added ${result.weighIns} weigh-ins and ${result.stepDays} days of steps.${kept} ` +
      'Steps are on Trends and Today; weigh-ins on the Weight tab.',
  };
};
