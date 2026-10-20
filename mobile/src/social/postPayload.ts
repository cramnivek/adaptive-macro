import type { Milestone, SetRecord } from '@adaptive-macros/engine';
import { detectCardio } from '../cardio';
import type { LoggedSet } from '../db';
import { displayWeight, formatDateLong } from '../format';
import { describeMilestone } from '../milestones';
import type { ShareExercise, ShareSummary } from '../shareCard';
import type { UnitSystem } from '../state/settings';

/**
 * A finished workout as the server keeps it, and as a reader sees it.
 *
 * Kept in kilograms and minutes, never as formatted text: a post is read by
 * people in other units, and "220.5 lb" written by a pound user is wrong for
 * every reader in kilograms. The reader formats. The share card is the same
 * view at a larger size and is built from here too, so the card and the post
 * can never disagree about which set was a lift's best.
 */

export const MAX_CAPTION = 500;
const MAX_TITLE = 80;
const MAX_EXERCISES = 30;
const MAX_NAME = 80;

export interface PostExercise {
  name: string;
  sets: number;
  /** Null for a lift done with no added load; the reader quotes its reps instead. */
  best_kg: number | null;
  best_reps: number;
  /**
   * Present, and true, when the quoted set was an all-time record. Left out
   * otherwise, so a lift without one is the four-key shape posts always had.
   */
  pr?: true;
}

/** A `posts` row, column for column, less what the server fills in. */
export interface PostRow {
  session_id: string;
  title: string;
  performed_on: string;
  duration_min: number;
  sets: number;
  volume_kg: number | null;
  exercises: PostExercise[];
  highlight: Milestone | null;
  caption: string | null;
}

export interface FinishedWorkout {
  sessionId: string;
  title: string;
  date: string;
  startedAt: string;
  finishedAt: Date;
  sets: LoggedSet[];
  milestone: Milestone | null;
  /** The sets that were all-time records, from `recordsInSession`. */
  records?: SetRecord[];
}

/**
 * A lift's name as the database will accept it: at most eighty characters and
 * never empty. Names come from custom exercises and imports, so neither is
 * ruled out. Counted in code points, as Postgres counts, so an emoji is not
 * cut in half; half of one cannot be stored.
 */
const storedName = (name: string): string => Array.from(name).slice(0, MAX_NAME).join('') || 'Exercise';

export const postPayload = (workout: FinishedWorkout, caption: string | null): PostRow => {
  const said = caption?.trim() ? caption.trim() : null;
  if (said !== null && said.length > MAX_CAPTION) {
    throw new Error(`A caption can be at most ${MAX_CAPTION} characters.`);
  }

  // Warm-ups are left out of all of it, as they are everywhere else — a post
  // that counts the empty bar is flattering, not honest.
  const isCardioSet = (set: LoggedSet): boolean => set.isCardio === true || detectCardio(set.exerciseName);
  const working = workout.sets.filter((set) => set.setType !== 'warmup');
  const strengthSets = working.filter((set) => !isCardioSet(set));
  const order: string[] = [];
  for (const set of working) if (!order.includes(set.exerciseName)) order.push(set.exerciseName);

  const exercises = order.map((name): PostExercise => {
    const mine = working.filter((set) => set.exerciseName === name);
    const isCardio = mine.some((set) => isCardioSet(set));
    if (isCardio) {
      return { name: storedName(name), sets: 0, best_kg: null, best_reps: 0 };
    }
    const loaded = mine.filter((set) => set.weightKg !== null && set.weightKg > 0);
    if (loaded.length === 0) {
      return { name: storedName(name), sets: mine.length, best_kg: null, best_reps: Math.max(...mine.map((set) => set.reps)) };
    }
    // A record set if there was one, as the share card quotes it; otherwise the
    // heaviest, and of those the most reps: the set someone would quote.
    const record = loaded.find((set) => workout.records?.some((r) => r.setId === set.id));
    const top =
      record ??
      loaded.reduce((a, b) =>
        (b.weightKg as number) > (a.weightKg as number) ||
        ((b.weightKg as number) === (a.weightKg as number) && b.reps > a.reps)
          ? b
          : a,
      );
    return {
      name: storedName(name),
      sets: mine.length,
      best_kg: top.weightKg as number,
      best_reps: top.reps,
      ...(record ? { pr: true as const } : {}),
    };
  });

  const volumeKg = strengthSets.reduce((sum, set) => sum + (set.weightKg ?? 0) * set.reps, 0);
  const minutes = Math.round((workout.finishedAt.getTime() - new Date(workout.startedAt).getTime()) / 60000);

  return {
    session_id: workout.sessionId,
    title: workout.title.trim().slice(0, MAX_TITLE) || 'Workout',
    performed_on: workout.date,
    duration_min: Math.max(1, minutes),
    sets: strengthSets.length,
    volume_kg: volumeKg > 0 ? volumeKg : null,
    exercises: exercises.slice(0, MAX_EXERCISES),
    highlight:
      workout.milestone?.exercise === undefined
        ? workout.milestone
        : { ...workout.milestone, exercise: storedName(workout.milestone.exercise) },
    caption: said,
  };
};

export interface RoutineExerciseFromPost {
  name: string;
  bodyweightBased: boolean;
  targetSets: number;
  targetReps: string | null;
  isCardio?: boolean;
}

export type PostView = ShareSummary & {
  caption: string | null;
  sessionId?: string;
  /** Who posted it, where the row says; card images are filed under it. */
  authorId?: string;
  rawExercises?: PostExercise[];
  /** Every lift, formatted for the reader as `exercises` is; that list stops at `maxExercises`. */
  allExercises?: ShareExercise[];
};

/**
 * Transforms stored post exercises into routine exercise drafts ready for `createRoutine`.
 */
export const routineExercisesFromPost = (exercises: PostExercise[]): RoutineExerciseFromPost[] =>
  exercises.map((lift) => {
    const isCardio = wasCardio(lift);
    return {
      name: lift.name,
      bodyweightBased: lift.best_kg === null && !isCardio,
      targetSets: lift.sets > 0 ? lift.sets : 3,
      targetReps: lift.best_reps > 0 ? String(lift.best_reps) : null,
      isCardio,
    };
  });

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

/**
 * The card's headline when no milestone was crossed but a record was set: the
 * first lift that set one, by the set that did it. A milestone still wins,
 * because a round number is the rarer thing.
 */
export const recordHighlight = (exercises: ShareExercise[]): ShareSummary['highlight'] => {
  const first = exercises.find((exercise) => exercise.pr);
  return first ? { label: first.name.toUpperCase(), figure: first.best } : null;
};

export const trim = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Whatever the server sent, as lifts the reader can draw. A row written by an
 * old app, by hand, or before the database checked its shape may hold
 * anything, and a post that cannot be drawn must cost the reader one line, not
 * the screen.
 */
const readableLifts = (exercises: unknown): PostExercise[] =>
  (Array.isArray(exercises) ? exercises : [])
    .filter((lift): lift is Record<string, unknown> => typeof lift === 'object' && lift !== null && typeof lift.name === 'string')
    .map((lift) => ({
      name: lift.name as string,
      sets: isNumber(lift.sets) ? lift.sets : 0,
      best_kg: isNumber(lift.best_kg) ? lift.best_kg : null,
      best_reps: isNumber(lift.best_reps) ? lift.best_reps : 0,
      ...(lift.pr === true ? { pr: true as const } : {}),
    }));

/** The highlight if `describeMilestone` can say something true about it; otherwise none. */
const readableHighlight = (highlight: unknown): Milestone | null => {
  if (typeof highlight !== 'object' || highlight === null) return null;
  const { kind, value, exercise } = highlight as Record<string, unknown>;
  if (kind !== 'load' && kind !== 'volume' && kind !== 'sessions') return null;
  if (!isNumber(value)) return null;
  if (exercise !== undefined && typeof exercise !== 'string') return null;
  return { kind, value, ...(exercise === undefined ? {} : { exercise }) };
};

/**
 * Whether a stored lift was cardio.
 *
 * The name is the first answer, but someone can type any name into the Cardio
 * tab — "Ski erg", "Spin class" — and `detectCardio` will not know it. What the
 * writer does know is written into the row: cardio is stored with no sets, no
 * weight and no reps, which a strength lift never is, because it always has at
 * least the set it was written from. Reading that back is what stops a ski erg
 * from being posted as "0 reps".
 */
const wasCardio = (lift: PostExercise): boolean =>
  detectCardio(lift.name) || (lift.sets === 0 && lift.best_kg === null && lift.best_reps === 0);

export const postView = (row: PostRow, units: UnitSystem, maxExercises = 3): PostView => {
  const unit = units === 'metric' ? 'kg' : 'lb';
  const best = (lift: PostExercise): string => {
    if (wasCardio(lift)) {
      return 'Cardio';
    }
    return lift.best_kg === null
      ? `${lift.best_reps} reps`
      : `${trim(Math.round(displayWeight(lift.best_kg, units) * 10) / 10)} ${unit} × ${lift.best_reps}`;
  };
  const lifts = readableLifts(row.exercises);
  const milestone = readableHighlight(row.highlight);
  const copy = milestone ? describeMilestone(milestone, units) : null;
  const exercises: ShareExercise[] = lifts.map((lift) => {
    const isCardio = wasCardio(lift);
    return {
      name: lift.name,
      sets: lift.sets,
      best: best(lift),
      ...(isCardio ? { isCardio: true, detail: 'Completed' } : {}),
      ...(lift.pr && !isCardio ? { pr: true } : {}),
    };
  });

  return {
    sessionId: row.session_id,
    ...('author_id' in row && typeof row.author_id === 'string' ? { authorId: row.author_id } : {}),
    title: row.title,
    date: formatDateLong(row.performed_on),
    duration: formatDuration(row.duration_min),
    sets: row.sets,
    volume:
      row.volume_kg === null
        ? null
        : `${Math.round(displayWeight(row.volume_kg, units)).toLocaleString('en-US')} ${unit}`,
    exercises: exercises.slice(0, maxExercises),
    more: Math.max(0, lifts.length - maxExercises),
    highlight: copy ? { label: copy.label, figure: copy.figure } : recordHighlight(exercises),
    caption: row.caption,
    rawExercises: lifts,
    allExercises: exercises,
  };
};
