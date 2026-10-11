import type { Milestone } from '@adaptive-macros/engine';
import type { LoggedSet } from '../db';
import { displayWeight, formatDateLong } from '../format';
import { describeMilestone } from '../milestones';
import type { ShareSummary } from '../shareCard';
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

export interface PostExercise {
  name: string;
  sets: number;
  /** Null for a lift done with no added load; the reader quotes its reps instead. */
  best_kg: number | null;
  best_reps: number;
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
}

export const postPayload = (workout: FinishedWorkout, caption: string | null): PostRow => {
  const said = caption?.trim() ? caption.trim() : null;
  if (said !== null && said.length > MAX_CAPTION) {
    throw new Error(`A caption can be at most ${MAX_CAPTION} characters.`);
  }

  // Warm-ups are left out of all of it, as they are everywhere else — a post
  // that counts the empty bar is flattering, not honest.
  const working = workout.sets.filter((set) => set.setType !== 'warmup');
  const order: string[] = [];
  for (const set of working) if (!order.includes(set.exerciseName)) order.push(set.exerciseName);

  const exercises = order.map((name): PostExercise => {
    const mine = working.filter((set) => set.exerciseName === name);
    const loaded = mine.filter((set) => set.weightKg !== null && set.weightKg > 0);
    if (loaded.length === 0) {
      return { name, sets: mine.length, best_kg: null, best_reps: Math.max(...mine.map((set) => set.reps)) };
    }
    // Heaviest, and of those the most reps: the set someone would quote.
    const top = loaded.reduce((a, b) =>
      (b.weightKg as number) > (a.weightKg as number) ||
      ((b.weightKg as number) === (a.weightKg as number) && b.reps > a.reps)
        ? b
        : a,
    );
    return { name, sets: mine.length, best_kg: top.weightKg as number, best_reps: top.reps };
  });

  const volumeKg = working.reduce((sum, set) => sum + (set.weightKg ?? 0) * set.reps, 0);
  const minutes = Math.round((workout.finishedAt.getTime() - new Date(workout.startedAt).getTime()) / 60000);

  return {
    session_id: workout.sessionId,
    title: workout.title.trim().slice(0, MAX_TITLE) || 'Workout',
    performed_on: workout.date,
    duration_min: Math.max(1, minutes),
    sets: working.length,
    volume_kg: volumeKg > 0 ? volumeKg : null,
    exercises: exercises.slice(0, MAX_EXERCISES),
    highlight: workout.milestone,
    caption: said,
  };
};

export type PostView = ShareSummary & { caption: string | null };

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

export const trim = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export const postView = (row: PostRow, units: UnitSystem, maxExercises = 3): PostView => {
  const unit = units === 'metric' ? 'kg' : 'lb';
  const best = (lift: PostExercise): string =>
    lift.best_kg === null
      ? `${lift.best_reps} reps`
      : `${trim(Math.round(displayWeight(lift.best_kg, units) * 10) / 10)} ${unit} × ${lift.best_reps}`;
  const copy = row.highlight ? describeMilestone(row.highlight, units) : null;

  return {
    title: row.title,
    date: formatDateLong(row.performed_on),
    duration: formatDuration(row.duration_min),
    sets: row.sets,
    volume:
      row.volume_kg === null
        ? null
        : `${Math.round(displayWeight(row.volume_kg, units)).toLocaleString('en-US')} ${unit}`,
    exercises: row.exercises.slice(0, maxExercises).map((lift) => ({ name: lift.name, sets: lift.sets, best: best(lift) })),
    more: Math.max(0, row.exercises.length - maxExercises),
    highlight: copy ? { label: copy.label, figure: copy.figure } : null,
    caption: row.caption,
  };
};
