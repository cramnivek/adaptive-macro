import type { Milestone } from '@adaptive-macros/engine';
import type { LoggedSet } from './db';
import { postPayload, postView } from './social/postPayload';
import type { UnitSystem } from './state/settings';

/**
 * What a finished workout says about itself when it is shared.
 *
 * The figures someone would actually post: how long, how many sets, how much
 * was moved, and the best set of each lift. It is a post's view at story size,
 * so the picture and the post are worked out by the same code. Kept free of
 * drawing so the canvas only has to put it where it goes.
 */
export interface ShareSummary {
  title: string;
  date: string;
  duration: string;
  sets: number;
  volume: string | null;
  exercises: { name: string; sets: number; best: string }[];
  /** How many more lifts there were than the card has room for. */
  more: number;
  highlight: { label: string; figure: string } | null;
}

/**
 * One working set as a bar: how tall it stands against the day's biggest, and
 * whether it belongs to the lift that moved the most.
 */
export interface ClimbBar {
  height: number;
  top: boolean;
}

/**
 * The card is a post's view plus the shape of the day — every set, in order.
 * That is the one thing the card shows which a post row does not carry: it is
 * drawn, not stored, because a reader elsewhere would need the sets to draw it
 * and a post is a summary.
 */
export type ShareCard = ShareSummary & { climb: ClimbBar[] };

/** Lifts beyond this are summed into "+ 2 more": a story card is not a log. */
const MAX_EXERCISES = 3;

const climb = (sets: LoggedSet[]): ClimbBar[] => {
  // Warm-ups are left out here as they are everywhere else.
  const working = sets.filter((set) => set.setType !== 'warmup');
  // A day with no weight on anything is drawn by its reps instead, so a
  // calisthenics session has a shape rather than a flat line.
  const weighted = working.some((set) => (set.weightKg ?? 0) > 0);
  const size = (set: LoggedSet): number => (weighted ? (set.weightKg ?? 0) * set.reps : set.reps);

  const moved = new Map<string, number>();
  for (const set of working) moved.set(set.exerciseName, (moved.get(set.exerciseName) ?? 0) + size(set));
  let biggest: string | null = null;
  for (const [name, total] of moved) if (biggest === null || total > (moved.get(biggest) as number)) biggest = name;

  const peak = Math.max(0, ...working.map(size));
  return working.map((set) => ({
    height: peak > 0 ? size(set) / peak : 0,
    top: set.exerciseName === biggest,
  }));
};

export const shareSummary = (input: {
  title: string;
  date: string;
  startedAt: string;
  finishedAt: Date;
  sets: LoggedSet[];
  units: UnitSystem;
  milestone: Milestone | null;
}): ShareCard => ({
  ...postView(postPayload({ ...input, sessionId: '' }, null), input.units, MAX_EXERCISES),
  climb: climb(input.sets),
});
