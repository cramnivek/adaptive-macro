import type { ISODate } from './types.ts';

/**
 * Lifting history and progressive overload.
 *
 * Pure by design, like the rest of this package: no I/O, no clock, no
 * database. Bodyweight in particular arrives as a parameter rather than being
 * fetched, which is what lets the bodyweight rules below be tested without a
 * device.
 *
 * Nothing here produces an energy figure. `expenditure.ts` already absorbs
 * training through the gap between logged intake and observed weight change —
 * train harder and the filter raises its estimate to keep explaining the data.
 * Adding workout calories on top of that counts the same energy twice, which
 * is the defect that makes exercise calories untrustworthy elsewhere.
 */

/** Hevy's own set classification, kept verbatim rather than flattened. */
export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure';

export interface WorkoutSet {
  id: string;
  sessionId: string;
  /**
   * Denormalized, as `food_name` is on `log_entries`: renaming an exercise
   * later must not rewrite what history says happened.
   */
  exerciseName: string;
  setIndex: number;
  /** Canonical kg. Null means "not recorded" — never zero. */
  weightKg: number | null;
  reps: number | null;
  setType: SetType;
  /** Recorded and displayed; nothing here computes from it. */
  rpe: number | null;
  /** Carried on the set so load can be resolved without an exercise lookup. */
  bodyweightBased: boolean;
}

export interface WorkoutSession {
  id: string;
  date: ISODate;
  name: string;
  startedAt: string;
  finishedAt: string | null;
}

/**
 * The load a set actually moved, in kg.
 *
 * Null means "cannot be scored" and the caller must drop the set rather than
 * substitute a number. The two ways that happens are different mistakes with
 * the same fix:
 *
 * - A loaded exercise with no weight recorded is a data-entry slip — three
 *   Bench Press and two Deadlift rows in the imported history. Scoring those
 *   as 0 kg drags a real progression line down.
 * - A bodyweight exercise on a date with no weight trend has no basis at all.
 *   Falling back to the added load would report a weighted dip as the plate
 *   alone, wrong by a factor and invisible.
 */
export const effectiveLoadKg = (
  set: Pick<WorkoutSet, 'weightKg' | 'bodyweightBased'>,
  bodyweightKg: number | null,
): number | null => {
  if (!set.bodyweightBased) return set.weightKg;
  if (bodyweightKg === null) return null;
  return bodyweightKg + (set.weightKg ?? 0);
};

/**
 * Whether a set counts toward progression.
 *
 * Only warmups are excluded. A dropset and a set taken to failure are both
 * working sets and belong in the numbers; warmups in a progression series
 * flatten the line and hide the trend.
 */
export const isWorkingSet = (set: Pick<WorkoutSet, 'setType'>): boolean =>
  set.setType !== 'warmup';

/** A set paired with the date of the session it belongs to. */
export interface DatedSet {
  date: ISODate;
  set: WorkoutSet;
}

export interface ProgressionPoint {
  date: ISODate;
  /** Effective load of the heaviest working set that day. */
  heaviestWorkingSetKg: number;
  /** Sum of effective load × reps across that day's working sets. */
  workingVolumeKg: number;
  /** True when this day beat every earlier one. A tie is not a record. */
  isRecord: boolean;
}

/**
 * One exercise's progression over time, one point per session date.
 *
 * Both figures are computed on effective load, so bodyweight work counts for
 * what it actually moved. Warmups are excluded, and so is any set that cannot
 * be scored — a session left with nothing usable produces no point at all
 * rather than a zero, which would read as a session where the weight
 * collapsed.
 *
 * `bodyweightByDate` is supplied by the caller from the expenditure series'
 * `trendWeightKg`. Taking it as a parameter is what keeps this module free of
 * the filter and testable on its own.
 */
export const progressionFor = (
  sets: DatedSet[],
  bodyweightByDate: ReadonlyMap<ISODate, number>,
): ProgressionPoint[] => {
  const byDate = new Map<ISODate, { heaviest: number; volume: number }>();

  for (const { date, set } of sets) {
    if (!isWorkingSet(set)) continue;
    // Zero reps is an attempt that did not happen, not a set. Letting it
    // through set the heaviest working weight -- and could mark a record --
    // off a lift that was never completed.
    if (set.reps === null || set.reps <= 0) continue;

    const load = effectiveLoadKg(set, bodyweightByDate.get(date) ?? null);
    if (load === null) continue;

    const day = byDate.get(date) ?? { heaviest: 0, volume: 0 };
    day.heaviest = Math.max(day.heaviest, load);
    day.volume += load * set.reps;
    byDate.set(date, day);
  }

  // Sorted before the record pass, because "beats everything before it" is a
  // statement about chronology rather than about input order.
  const ordered = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  let best = 0;
  return ordered.map(([date, day]) => {
    const isRecord = day.heaviest > best;
    if (isRecord) best = day.heaviest;
    return {
      date,
      heaviestWorkingSetKg: day.heaviest,
      workingVolumeKg: day.volume,
      isRecord,
    };
  });
};

/**
 * A MET-derived estimate of what a session cost, as a band.
 *
 * **Nothing in this app consumes this number.** `expenditure.ts` already
 * absorbs training through the gap between logged intake and observed weight
 * change: train harder and the filter raises its estimate to keep explaining
 * the data. Adding a workout figure on top of that counts the same energy
 * twice, raises the target and stalls the deficit — the exact defect that makes
 * exercise calories untrustworthy in mainstream trackers. This exists to be
 * displayed beside the filter's estimate as an outside check, and for no other
 * purpose.
 *
 * A band rather than a point because that is what the underlying number is:
 * published METs for resistance training run from roughly 3 to 6 depending on
 * how the session is conducted, which is about ±40% around the middle. A single
 * figure would read as a measurement.
 */
export const sessionEnergyKcal = (
  bodyweightKg: number | null,
  durationMinutes: number | null,
): { lo: number; mid: number; hi: number } | null => {
  if (bodyweightKg === null || durationMinutes === null) return null;
  if (bodyweightKg <= 0 || durationMinutes <= 0) return null;

  // kcal = MET × kg × hours.
  const hours = durationMinutes / 60;
  const at = (met: number) => met * bodyweightKg * hours;

  return { lo: at(3), mid: at(4.5), hi: at(6) };
};

/** Monday of the ISO week containing this date. */
const weekStartOf = (date: ISODate): ISODate => {
  const d = new Date(`${date}T00:00:00Z`);
  // getUTCDay: Sunday is 0, so Sunday belongs to the week that began six days
  // earlier rather than starting one.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};

/**
 * Working volume per week, in kg lifted.
 *
 * Reuses `isWorkingSet` and `effectiveLoadKg` rather than restating the
 * exclusions, so a warmup or an unscoreable set is dropped here for exactly the
 * same reasons it is dropped from progression.
 */
export const weeklyVolume = (
  sets: DatedSet[],
  bodyweightByDate: ReadonlyMap<ISODate, number>,
): { weekStart: ISODate; volumeKg: number }[] => {
  const byWeek = new Map<ISODate, number>();

  for (const { date, set } of sets) {
    if (!isWorkingSet(set)) continue;
    if (set.reps === null || set.reps <= 0) continue;

    const load = effectiveLoadKg(set, bodyweightByDate.get(date) ?? null);
    if (load === null) continue;

    const week = weekStartOf(date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + load * set.reps);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, volumeKg]) => ({ weekStart, volumeKg }));
};

/** A bodyweight lookup that also reports how much of it was assumed. */
export interface BodyweightLookup extends ReadonlyMap<ISODate, number> {
  /** Dates filled from the nearest known weight rather than measured on the day. */
  extendedCount: number;
}

/**
 * Bodyweight for each date a workout happened.
 *
 * The weight trend only covers days this app has observations for, and an
 * imported lifting history usually starts months before the first weigh-in.
 * Without `extend`, every bodyweight set from that period scores as nothing —
 * for a typical Hevy import that is the single most-trained exercise showing an
 * empty chart.
 *
 * With `extend`, dates outside the measured range take the nearest known
 * weight: the earliest for anything before it, the latest for anything after.
 * That is an assumption, not a measurement, so the count of dates it was
 * applied to is returned alongside — the caller is expected to say so on
 * screen rather than pass assumed weights off as recorded ones.
 *
 * Dates inside the range are always the measured trend, never interpolated.
 */
export const bodyweightForDates = (
  series: readonly { date: ISODate; trendWeightKg: number }[],
  dates: readonly ISODate[],
  options: { extend: boolean },
): BodyweightLookup => {
  const map = new Map<ISODate, number>() as Map<ISODate, number> & { extendedCount: number };
  map.extendedCount = 0;

  if (series.length === 0) return map;

  const measured = new Map(series.map((day) => [day.date, day.trendWeightKg]));
  const ordered = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  // Deduplicated: callers pass one entry per set, so counting the raw list
  // would report sets where the caller says sessions -- 206 pull-up sets
  // across 50 days read as "206 sessions assumed".
  for (const date of new Set(dates)) {
    const exact = measured.get(date);
    if (exact !== undefined) {
      map.set(date, exact);
      continue;
    }
    if (!options.extend) continue;

    // Only outside the range. A gap in the middle is a day with no observation
    // between two that have them, and inventing a weight there would be
    // interpolation dressed as data.
    if (date < first.date) {
      map.set(date, first.trendWeightKg);
      map.extendedCount += 1;
    } else if (date > last.date) {
      map.set(date, last.trendWeightKg);
      map.extendedCount += 1;
    }
  }

  return map;
};

export interface PeriodSummary {
  /** Days inside the period with at least one scoreable working set. */
  sessions: number;
  workingSets: number;
  /** Effective load × reps, summed across the period's working sets. */
  volumeKg: number;
  /** Exercise-days inside the period that beat every earlier day. */
  records: number;
  /** Distinct exercises trained in the period, first appearance first. */
  exercises: string[];
}

/**
 * What a week or a month actually came to.
 *
 * Takes the whole history rather than the period's sets alone, because a
 * record is a claim about everything that came before it. Handed only the
 * period, every first session in it would look like a record.
 *
 * Dates are ISO, so the range test is a string comparison; both ends are
 * inclusive. Everything is computed on effective load, so bodyweight work
 * counts for what it actually moved, and warmups are excluded throughout —
 * the same rule `progressionFor` uses, so the two never disagree about what a
 * set was worth.
 */
export const summarisePeriod = (
  allSets: DatedSet[],
  bodyweightByDate: ReadonlyMap<ISODate, number>,
  from: ISODate,
  to: ISODate,
): PeriodSummary => {
  const within = (date: ISODate) => date >= from && date <= to;

  const dates = new Set<ISODate>();
  const exercises: string[] = [];
  let workingSets = 0;
  let volumeKg = 0;

  for (const { date, set } of allSets) {
    if (!within(date) || !isWorkingSet(set)) continue;
    if (set.reps === null || set.reps <= 0) continue;
    const load = effectiveLoadKg(set, bodyweightByDate.get(date) ?? null);
    if (load === null) continue;

    dates.add(date);
    workingSets += 1;
    volumeKg += load * set.reps;
    if (!exercises.includes(set.exerciseName)) exercises.push(set.exerciseName);
  }

  // Records are resolved per exercise across all of history, then counted
  // only where they land inside the period.
  const byExercise = new Map<string, DatedSet[]>();
  for (const entry of allSets) {
    const existing = byExercise.get(entry.set.exerciseName);
    if (existing) existing.push(entry);
    else byExercise.set(entry.set.exerciseName, [entry]);
  }

  let records = 0;
  for (const sets of byExercise.values()) {
    for (const point of progressionFor(sets, bodyweightByDate)) {
      if (point.isRecord && within(point.date)) records += 1;
    }
  }

  return { sessions: dates.size, workingSets, volumeKg, records, exercises };
};

export type MilestoneKind = 'load' | 'volume' | 'sessions';

export interface Milestone {
  kind: MilestoneKind;
  /** The landmark that was crossed, in the units its ladder was given in. */
  value: number;
  /** Which lift crossed it. Only a `load` milestone has one. */
  exercise?: string;
}

export interface MilestoneLadders {
  /** Effective loads worth reaching, in kg, ascending. */
  loadKg: number[];
  /** Lifetime volume worth reaching, in kg, ascending. */
  volumeKg: number[];
  /** Session counts worth reaching, ascending. */
  sessions: number[];
}

/** Rarest first, so a day that crosses several has an obvious headline. */
const RANK: Record<MilestoneKind, number> = { load: 3, volume: 2, sessions: 1 };

/** The highest rung passed by `to` that `from` had not already passed. */
const crossed = (ladder: number[], from: number, to: number): number | null => {
  let found: number | null = null;
  for (const rung of ladder) {
    if (rung > from && rung <= to) found = rung;
  }
  return found;
};

/**
 * What happened on this date that is worth telling someone about.
 *
 * The bar is deliberately that high. A medal for finishing five sets is
 * forgettable precisely because it is always available, and a reward handed
 * out for logging rather than for training quietly encourages logging. Every
 * rung here is something a person would actually mention: a round number on a
 * lift, a lifetime of weight moved, a count of sessions that took months.
 *
 * Both sides of every comparison come from the same history, so a landmark
 * only counts the first time it is passed — repeating a 100 kg squat next week
 * is not news.
 *
 * The ladders are the caller's, in kg, because which numbers are round depends
 * on the unit someone thinks in: 100 and 140 in kilos, 225 and 315 in pounds.
 * This has no opinion on that.
 */
export const milestonesOn = (
  allSets: DatedSet[],
  bodyweightByDate: ReadonlyMap<ISODate, number>,
  date: ISODate,
  ladders: MilestoneLadders,
): Milestone[] => {
  const found: Milestone[] = [];

  const scored = allSets.filter(
    (entry) =>
      isWorkingSet(entry.set) &&
      entry.set.reps !== null &&
      entry.set.reps > 0 &&
      effectiveLoadKg(entry.set, bodyweightByDate.get(entry.date) ?? null) !== null,
  );

  const loadOf = (entry: DatedSet) =>
    effectiveLoadKg(entry.set, bodyweightByDate.get(entry.date) ?? null) ?? 0;

  // One per lift: the heaviest it went today, against the heaviest it had ever
  // gone before today.
  const exercises = new Set(
    scored.filter((entry) => entry.date === date).map((entry) => entry.set.exerciseName),
  );
  for (const exercise of exercises) {
    const mine = scored.filter((entry) => entry.set.exerciseName === exercise);
    const best = (entries: DatedSet[]) =>
      entries.reduce((max, entry) => Math.max(max, loadOf(entry)), 0);

    const rung = crossed(
      ladders.loadKg,
      best(mine.filter((entry) => entry.date < date)),
      best(mine.filter((entry) => entry.date === date)),
    );
    if (rung !== null) found.push({ kind: 'load', value: rung, exercise });
  }

  const volume = (entries: DatedSet[]) =>
    entries.reduce((total, entry) => total + loadOf(entry) * (entry.set.reps ?? 0), 0);

  const volumeRung = crossed(
    ladders.volumeKg,
    volume(scored.filter((entry) => entry.date < date)),
    volume(scored.filter((entry) => entry.date <= date)),
  );
  if (volumeRung !== null) found.push({ kind: 'volume', value: volumeRung });

  const dates = (upTo: (entryDate: ISODate) => boolean) =>
    new Set(scored.filter((entry) => upTo(entry.date)).map((entry) => entry.date)).size;

  const sessionRung = crossed(
    ladders.sessions,
    dates((entryDate) => entryDate < date),
    dates((entryDate) => entryDate <= date),
  );
  if (sessionRung !== null) found.push({ kind: 'sessions', value: sessionRung });

  return found.sort((a, b) => RANK[b.kind] - RANK[a.kind] || b.value - a.value);
};
