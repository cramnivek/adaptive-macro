import type { Milestone } from '@adaptive-macros/engine';
import type { LoggedSet } from './db';
import { displayWeight, formatDateLong } from './format';
import { describeMilestone } from './milestones';
import type { UnitSystem } from './state/settings';

/**
 * What a finished workout says about itself when it is shared.
 *
 * The figures someone would actually post: how long, how many sets, how much
 * was moved, and the best set of each lift. Warm-ups are left out of all of
 * it, as they are everywhere else — a card that counts the empty bar is
 * flattering, not honest. Kept free of drawing so it is tested here and the
 * canvas only has to put it where it goes.
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

/** Lifts beyond this are summed into "+ 2 more": a story card is not a log. */
const MAX_EXERCISES = 6;

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

const trim = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export const shareSummary = (input: {
  title: string;
  date: string;
  startedAt: string;
  finishedAt: Date;
  sets: LoggedSet[];
  units: UnitSystem;
  milestone: Milestone | null;
}): ShareSummary => {
  const unit = input.units === 'metric' ? 'kg' : 'lb';
  const working = input.sets.filter((set) => set.setType !== 'warmup');

  const order: string[] = [];
  for (const set of working) if (!order.includes(set.exerciseName)) order.push(set.exerciseName);

  const exercises = order.map((name) => {
    const mine = working.filter((set) => set.exerciseName === name);
    const loaded = mine.filter((set) => set.weightKg !== null && set.weightKg > 0);
    let best: string;
    if (loaded.length > 0) {
      // Heaviest, and of those the most reps: the set someone would quote.
      const top = loaded.reduce((a, b) =>
        (b.weightKg as number) > (a.weightKg as number) ||
        ((b.weightKg as number) === (a.weightKg as number) && b.reps > a.reps)
          ? b
          : a,
      );
      best = `${trim(Math.round(displayWeight(top.weightKg as number, input.units) * 10) / 10)} ${unit} × ${top.reps}`;
    } else {
      best = `${Math.max(...mine.map((set) => set.reps))} reps`;
    }
    return { name, sets: mine.length, best };
  });

  const volumeKg = working.reduce((sum, set) => sum + (set.weightKg ?? 0) * set.reps, 0);
  const minutes = Math.max(1, Math.round((input.finishedAt.getTime() - new Date(input.startedAt).getTime()) / 60000));
  const copy = input.milestone ? describeMilestone(input.milestone, input.units) : null;

  return {
    title: input.title,
    date: formatDateLong(input.date),
    duration: formatDuration(minutes),
    sets: working.length,
    volume: volumeKg > 0 ? `${Math.round(displayWeight(volumeKg, input.units)).toLocaleString('en-US')} ${unit}` : null,
    exercises: exercises.slice(0, MAX_EXERCISES),
    more: Math.max(0, exercises.length - MAX_EXERCISES),
    highlight: copy ? { label: copy.label, figure: copy.figure } : null,
  };
};
