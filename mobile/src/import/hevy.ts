import { lbToKg } from '@adaptive-macros/engine';
import type { SetType } from '@adaptive-macros/engine';

/**
 * Parses a Hevy CSV export.
 *
 * Pure: a string in, a structure out. No file picking, no database, no clock —
 * which is what makes it testable against the checked-in fixture.
 *
 * The export is one row per set: a workout of five exercises at four sets each
 * is twenty rows sharing a title and a pair of timestamps.
 */

/** Hevy's documented columns, in order. The export is 14 of them. */
export const HEVY_COLUMNS = [
  'title',
  'start_time',
  'end_time',
  'description',
  'exercise_title',
  'superset_id',
  'exercise_notes',
  'set_index',
  'set_type',
  'weight_lbs',
  'reps',
  'distance_miles',
  'duration_seconds',
  'rpe',
] as const;

/**
 * Columns this app does not model.
 *
 * Supersets are a non-goal and `superset_id` is empty on every row of the real
 * export anyway. Distance and duration describe sets that are not rep-based,
 * and coercing them into a rep model would invent numbers. Reported so the
 * omission is visible rather than assumed.
 */
export const UNMODELLED_COLUMNS = [
  'superset_id',
  'description',
  'exercise_notes',
  'distance_miles',
  'duration_seconds',
] as const;

export interface ParsedSet {
  setIndex: number;
  /** Canonical kg, converted once from Hevy's pounds. Null means not recorded. */
  weightKg: number | null;
  reps: number;
  setType: SetType;
  rpe: number | null;
}

export interface ParsedExerciseBlock {
  name: string;
  sets: ParsedSet[];
}

export interface ParsedSession {
  title: string;
  /** Naive local `YYYY-MM-DDTHH:MM`. See `toIsoLocal`. */
  startedAt: string;
  finishedAt: string | null;
  date: string;
  exercises: ParsedExerciseBlock[];
}

export interface ParsedExercise {
  name: string;
  /** Inferred: every one of its sets carries no weight. Editable downstream. */
  bodyweightBased: boolean;
  setCount: number;
}

export interface HevyParseResult {
  sessions: ParsedSession[];
  exercises: ParsedExercise[];
  droppedColumns: readonly string[];
  counts: {
    sessions: number;
    exercises: number;
    sets: number;
    firstDate: string | null;
    lastDate: string | null;
  };
  skipped: {
    /** Rows logged by duration or distance. They have no rep-based meaning. */
    noReps: number;
    /**
     * Sets kept but unusable for progression: a loaded lift with no weight.
     * Counted rather than dropped — the session really happened, and
     * `effectiveLoadKg` already excludes them from the numbers.
     */
    noWeightOnLoadedLift: number;
  };
}

/**
 * Splits one CSV line into fields, honouring quotes.
 *
 * This is the hazard the format documentation warns about: timestamps are
 * written as `"29 Dec 2025, 15:37"`, with a comma inside the quotes. Splitting
 * on commas breaks every row and does so while still producing fields that
 * look plausible, which is far worse than failing.
 */
const splitCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') {
      fields.push(field);
      field = '';
    } else field += char;
  }

  fields.push(field);
  return fields;
};

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/**
 * `29 Dec 2025, 15:37` → `2025-12-29T15:37`.
 *
 * Built from the parts rather than via `Date`, deliberately. Hevy writes no
 * timezone, so the value is a local wall-clock time; passing it through `Date`
 * would attach the running machine's offset and shift sessions across midnight
 * depending on where the import happened to run.
 */
export const toIsoLocal = (value: string): string | null => {
  const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}), (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, day, month, year, hour, minute] = match;
  const mm = MONTHS[month];
  if (!mm) return null;

  return `${year}-${mm}-${day.padStart(2, '0')}T${hour}:${minute}`;
};

const SET_TYPES = new Set<string>(['normal', 'warmup', 'dropset', 'failure']);

const numberOrNull = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

export const parseHevyCsv = (text: string): HevyParseResult => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) throw new Error('Hevy import: the file is empty');

  const header = splitCsvLine(lines[0]).map((h) => h.trim());

  // Fails loudly and prints what arrived. If Hevy changes the format, this
  // says so immediately instead of importing zeros over real history. The
  // columns are known, so this is an equality check rather than a detector:
  // detecting them at runtime would swallow the very change it exists to catch.
  const matches =
    header.length === HEVY_COLUMNS.length &&
    HEVY_COLUMNS.every((name, i) => header[i] === name);

  if (!matches) {
    throw new Error(
      `Hevy import: unexpected columns.\n` +
        `expected: ${HEVY_COLUMNS.join(', ')}\n` +
        `received: ${header.join(', ')}`,
    );
  }

  const index = (name: string) => HEVY_COLUMNS.indexOf(name as (typeof HEVY_COLUMNS)[number]);
  const iTitle = index('title');
  const iStart = index('start_time');
  const iEnd = index('end_time');
  const iExercise = index('exercise_title');
  const iSetIndex = index('set_index');
  const iSetType = index('set_type');
  const iWeight = index('weight_lbs');
  const iReps = index('reps');
  const iRpe = index('rpe');

  const sessions = new Map<string, ParsedSession>();
  // Name -> whether any set of it carried a weight. Inference reads this after
  // every row is seen, so one weighted set is enough to rule the exercise out.
  const sawWeight = new Map<string, boolean>();
  const setCounts = new Map<string, number>();

  let noReps = 0;
  let noWeightOnLoadedLift = 0;

  for (const line of lines.slice(1)) {
    const row = splitCsvLine(line);
    const startedAt = toIsoLocal(row[iStart] ?? '');
    if (startedAt === null) {
      throw new Error(`Hevy import: unreadable start_time ${JSON.stringify(row[iStart])}`);
    }

    const reps = numberOrNull(row[iReps] ?? '');
    const name = (row[iExercise] ?? '').trim();

    // Logged by duration or distance. Both are non-goals, so the row is
    // dropped rather than coerced into a rep-based model it does not fit.
    if (reps === null) {
      noReps += 1;
      continue;
    }

    const lbs = numberOrNull(row[iWeight] ?? '');
    const weightKg = lbs === null ? null : lbToKg(lbs);

    sawWeight.set(name, (sawWeight.get(name) ?? false) || weightKg !== null);
    setCounts.set(name, (setCounts.get(name) ?? 0) + 1);

    const rawType = (row[iSetType] ?? '').trim();
    const setType = (SET_TYPES.has(rawType) ? rawType : 'normal') as SetType;

    const session =
      sessions.get(startedAt) ??
      ({
        title: (row[iTitle] ?? '').trim(),
        startedAt,
        finishedAt: toIsoLocal(row[iEnd] ?? ''),
        date: startedAt.slice(0, 10),
        exercises: [],
      } satisfies ParsedSession);
    sessions.set(startedAt, session);

    // Grouped by name within the session, keeping first-seen order so the
    // exercises read back in the order they were performed.
    let block = session.exercises.find((e) => e.name === name);
    if (!block) {
      block = { name, sets: [] };
      session.exercises.push(block);
    }

    block.sets.push({
      setIndex: numberOrNull(row[iSetIndex] ?? '') ?? block.sets.length,
      weightKg,
      reps,
      setType,
      rpe: numberOrNull(row[iRpe] ?? ''),
    });
  }

  const exercises: ParsedExercise[] = [...setCounts.entries()]
    .map(([name, setCount]) => ({
      name,
      bodyweightBased: sawWeight.get(name) === false,
      setCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Counted after inference, because whether a missing weight is a slip or
  // simply how that exercise works is exactly what the inference decides.
  const bodyweight = new Set(exercises.filter((e) => e.bodyweightBased).map((e) => e.name));
  for (const session of sessions.values()) {
    for (const block of session.exercises) {
      if (bodyweight.has(block.name)) continue;
      noWeightOnLoadedLift += block.sets.filter((s) => s.weightKg === null).length;
    }
  }

  const ordered = [...sessions.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const sets = ordered.reduce(
    (total, s) => total + s.exercises.reduce((n, e) => n + e.sets.length, 0),
    0,
  );

  return {
    sessions: ordered,
    exercises,
    droppedColumns: UNMODELLED_COLUMNS,
    counts: {
      sessions: ordered.length,
      exercises: exercises.length,
      sets,
      firstDate: ordered[0]?.date ?? null,
      lastDate: ordered[ordered.length - 1]?.date ?? null,
    },
    skipped: { noReps, noWeightOnLoadedLift },
  };
};
