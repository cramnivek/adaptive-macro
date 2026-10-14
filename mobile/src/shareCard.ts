import type { Milestone } from '@adaptive-macros/engine';
import {
  type CardioMode,
  calculateCardioSteps,
  calculateTreadmillMetrics,
  detectCardio,
  detectCardioMode,
  displaySpeed,
  formatCardioEffort,
  formatDurationDisplay,
  speedUnit,
} from './cardio';
import type { LoggedSet } from './db';
import { displayWeight, formatDateLong } from './format';
import { describeMilestone } from './milestones';
import { formatDuration, trim } from './social/postPayload';
import type { UnitSystem } from './state/settings';

export interface ShareExercise {
  name: string;
  sets: number;
  best: string;
  isCardio?: boolean;
  detail?: string;
}

/**
 * What a finished workout says about itself when it is shared.
 *
 * The figures someone would actually post: how long, how many sets, how much
 * was moved, and the best set of each lift. Cardio activities are presented
 * with their effort, pace, and step estimates rather than treated as sets.
 */
export interface ShareSummary {
  title: string;
  date: string;
  duration: string;
  sets: number;
  volume: string | null;
  exercises: ShareExercise[];
  /** How many more lifts there were than the card has room for. */
  more: number;
  highlight: { label: string; figure: string } | null;
  /** Estimated steps from cardio in this session. */
  steps?: number | null;
  /** Total distance in km from cardio in this session. */
  cardioDistanceKm?: number | null;
}

/** Lifts beyond this are summed into "+ 2 more": a story card is not a log. */
export const MAX_SHARE_EXERCISES = 6;

export const shareSummary = (input: {
  title: string;
  date: string;
  startedAt: string;
  finishedAt: Date;
  sets: LoggedSet[];
  units: UnitSystem;
  milestone: Milestone | null;
}): ShareSummary => {
  const working = input.sets.filter((s) => s.setType !== 'warmup');
  const isCardioSet = (s: LoggedSet): boolean => s.isCardio === true || detectCardio(s.exerciseName);

  const strengthWorking = working.filter((s) => !isCardioSet(s));
  const cardioWorking = working.filter((s) => isCardioSet(s));

  let totalSteps = 0;
  let totalDistanceKm = 0;

  for (const s of cardioWorking) {
    const mode = s.cardioMode ?? detectCardioMode(s.exerciseName);
    totalSteps += calculateCardioSteps({
      mode,
      speedKph: s.speedKph,
      inclinePct: s.inclinePct,
      durationSeconds: s.durationSeconds,
      distanceKm: s.distanceKm,
    });
    if (s.distanceKm && s.distanceKm > 0) {
      totalDistanceKm += s.distanceKm;
    } else if (s.speedKph && s.durationSeconds) {
      const { distanceKm } = calculateTreadmillMetrics(s.speedKph, s.inclinePct ?? null, s.durationSeconds);
      if (distanceKm) totalDistanceKm += distanceKm;
    }
  }

  const order: string[] = [];
  for (const s of working) {
    if (!order.includes(s.exerciseName)) order.push(s.exerciseName);
  }

  const exercises: ShareExercise[] = order.map((name): ShareExercise => {
    const mine = working.filter((s) => s.exerciseName === name);
    const isCardio = mine.some((s) => isCardioSet(s));

    if (isCardio) {
      const primary = mine[0];
      const mode: CardioMode = primary?.cardioMode ?? detectCardioMode(name);
      const totalDur = mine.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
      const totalDist = mine.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);

      let stepsForExercise = 0;
      for (const s of mine) {
        stepsForExercise += calculateCardioSteps({
          mode: s.cardioMode ?? mode,
          speedKph: s.speedKph,
          inclinePct: s.inclinePct,
          durationSeconds: s.durationSeconds,
          distanceKm: s.distanceKm,
        });
      }

      let bestText = '';
      let detailText = mode === 'outside' ? 'Outside' : 'Machine';

      if (mode === 'outside') {
        const parts: string[] = [];
        if (totalDist > 0) parts.push(`${totalDist.toFixed(1)} km`);
        if (totalDur > 0) parts.push(formatDurationDisplay(totalDur));
        bestText = parts.join(' · ') || (primary ? formatCardioEffort(primary, input.units) : 'Cardio');
        if (stepsForExercise > 0) {
          detailText = `Outside · ~${stepsForExercise.toLocaleString()} steps`;
        }
      } else {
        // treadmill / machine
        const parts: string[] = [];
        if (primary?.speedKph != null) {
          const spd = displaySpeed(primary.speedKph, input.units);
          if (spd != null) parts.push(`${spd.toFixed(1)} ${speedUnit(input.units)}`);
        }
        if (primary?.inclinePct != null && primary.inclinePct > 0) {
          parts.push(`${primary.inclinePct.toFixed(1)}%`);
        }
        if (totalDur > 0) parts.push(formatDurationDisplay(totalDur));
        bestText = parts.join(' · ') || (primary ? formatCardioEffort(primary, input.units) : 'Cardio');
        if (stepsForExercise > 0) {
          detailText = `Machine · ~${stepsForExercise.toLocaleString()} steps`;
        }
      }

      return {
        name,
        sets: 0,
        best: bestText,
        isCardio: true,
        detail: detailText,
      };
    }

    // Strength exercise
    const loaded = mine.filter((s) => s.weightKg !== null && s.weightKg > 0);
    if (loaded.length === 0) {
      const maxReps = Math.max(...mine.map((s) => s.reps));
      return {
        name,
        sets: mine.length,
        best: `${maxReps} reps`,
      };
    }

    const top = loaded.reduce((a, b) =>
      (b.weightKg as number) > (a.weightKg as number) ||
      ((b.weightKg as number) === (a.weightKg as number) && b.reps > a.reps)
        ? b
        : a,
    );
    const unit = input.units === 'metric' ? 'kg' : 'lb';
    const weightDisplay = trim(Math.round(displayWeight(top.weightKg as number, input.units) * 10) / 10);
    return {
      name,
      sets: mine.length,
      best: `${weightDisplay} ${unit} × ${top.reps}`,
    };
  });

  const volumeKg = strengthWorking.reduce((sum, s) => sum + (s.weightKg ?? 0) * s.reps, 0);
  const minutes = Math.max(1, Math.round((input.finishedAt.getTime() - new Date(input.startedAt).getTime()) / 60000));
  const unit = input.units === 'metric' ? 'kg' : 'lb';
  const milestoneCopy = input.milestone ? describeMilestone(input.milestone, input.units) : null;

  return {
    title: input.title.trim() || 'Workout',
    date: formatDateLong(input.date),
    duration: formatDuration(minutes),
    sets: strengthWorking.length,
    volume:
      volumeKg > 0
        ? `${Math.round(displayWeight(volumeKg, input.units)).toLocaleString('en-US')} ${unit}`
        : null,
    exercises: exercises.slice(0, MAX_SHARE_EXERCISES),
    more: Math.max(0, exercises.length - MAX_SHARE_EXERCISES),
    highlight: milestoneCopy ? { label: milestoneCopy.label, figure: milestoneCopy.figure } : null,
    steps: totalSteps > 0 ? totalSteps : null,
    cardioDistanceKm: totalDistanceKm > 0 ? totalDistanceKm : null,
  };
};
