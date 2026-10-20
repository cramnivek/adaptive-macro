import { liftingEnergyKcal, type LiftingEnergy, type Milestone, type SetRecord } from '@adaptive-macros/engine';
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
import { formatDuration, recordHighlight, trim } from './social/postPayload';
import type { UnitSystem } from './state/settings';

export interface ShareExercise {
  name: string;
  sets: number;
  best: string;
  isCardio?: boolean;
  detail?: string;
  /** This lift set an all-time record today, and `best` is that set. */
  pr?: boolean;
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
  /**
   * Rough burn above resting from the lifting, when a body weight was given.
   * For reading only: the measured expenditure already includes it.
   */
  liftingEnergy?: LiftingEnergy | null;
}

/**
 * One working set as a bar: how tall it stands against the day's biggest, and
 * whether it belongs to the exercise that did the most.
 */
export interface ClimbBar {
  height: number;
  top: boolean;
}

/**
 * The card is the summary plus the shape of the day — every set, in order.
 * That is the one thing the card draws which a post row does not carry: it is
 * worked out here and drawn, never stored, because a reader elsewhere would
 * need the sets themselves to draw it and a post is a summary.
 */
export type ShareCard = ShareSummary & { climb: ClimbBar[] };

/**
 * What a set is worth, for the picture: the weight it moved, or its reps when
 * nothing that day carried weight, or its seconds when it has no reps either.
 * Three scales, but only ever one of them in a day, so the bars stay comparable
 * — and on a day that mixed lifting with cardio, the cardio sets stand at
 * nothing, which is the truth about load.
 */
const climb = (sets: LoggedSet[]): ClimbBar[] => {
  const working = sets.filter((set) => set.setType !== 'warmup');
  const weighted = working.some((set) => (set.weightKg ?? 0) > 0);
  const repped = working.some((set) => set.reps > 0);
  const size = (set: LoggedSet): number => {
    if (weighted) return (set.weightKg ?? 0) * set.reps;
    if (repped) return set.reps;
    return set.durationSeconds ?? 0;
  };

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
  /** The trend weight on the day, for the lifting energy estimate; omitted, there is none. */
  bodyweightKg?: number | null;
  /** The sets that were all-time records, from `recordsInSession`; omitted, none are marked. */
  records?: SetRecord[];
}): ShareCard => {
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

    // A record set is the one worth quoting, even when a heavier set with fewer
    // reps came before it; otherwise the heaviest, and of those the most reps.
    const record = loaded.find((s) => input.records?.some((r) => r.setId === s.id));
    const top =
      record ??
      loaded.reduce((a, b) =>
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
      ...(record ? { pr: true } : {}),
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
    highlight: milestoneCopy
      ? { label: milestoneCopy.label, figure: milestoneCopy.figure }
      : recordHighlight(exercises),
    steps: totalSteps > 0 ? totalSteps : null,
    cardioDistanceKm: totalDistanceKm > 0 ? totalDistanceKm : null,
    // The session's time, less what was spent on cardio, which has figures of
    // its own; only when there was lifting to estimate.
    liftingEnergy:
      strengthWorking.length > 0
        ? liftingEnergyKcal(
            minutes - cardioWorking.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / 60,
            input.bodyweightKg ?? null,
          )
        : null,
    climb: climb(input.sets),
  };
};

/** A piece of the title, and whether it is the red part. */
export interface TitlePart {
  text: string;
  red: boolean;
}

/**
 * The title as the card sets it: one or two lines, the last of them red.
 *
 * The break goes wherever it leaves the two lines most alike in length, not
 * before the last word. "Pull #1 Phase 1" broken before its last word gives a
 * second line reading "1.", which looks like a mistake rather than a title;
 * broken down the middle it gives PULL #1 / PHASE 1., which is what it is.
 * Counting characters is enough — the face is even enough that measuring the
 * real widths moves the break only when the two candidates were alike anyway.
 *
 * A one-word title keeps its line and takes the red full stop on the end,
 * because a line holding nothing but a full stop reads as a mistake too.
 */
export const titleLines = (title: string): TitlePart[][] => {
  const words = title.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return [[{ text: words[0] ?? 'WORKOUT', red: false }, { text: '.', red: true }]];
  }

  let at = words.length - 1;
  let closest = Number.POSITIVE_INFINITY;
  for (let k = 1; k < words.length; k += 1) {
    const first = words.slice(0, k).join(' ').length;
    // The full stop belongs to the second line and counts towards its width.
    const second = words.slice(k).join(' ').length + 1;
    const apart = Math.abs(first - second);
    if (apart < closest) {
      closest = apart;
      at = k;
    }
  }

  return [
    [{ text: words.slice(0, at).join(' '), red: false }],
    [{ text: `${words.slice(at).join(' ')}.`, red: true }],
  ];
};

/**
 * Converts a post summary into a full ShareCard, synthesizing climb bars
 * from the exercise list and sets so that the rendered card carries the
 * signature ascending red and grey climb bars.
 */
export const postViewToShareCard = (view: ShareSummary): ShareCard => {
  const bars: ClimbBar[] = [];
  if (view.exercises && view.exercises.length > 0) {
    view.exercises.forEach((ex, exIdx) => {
      const setCount = Math.max(1, Math.min(ex.sets || 3, 6));
      const isTop = exIdx === 0;
      const baseScale = isTop ? 1.0 : Math.max(0.4, 0.85 - exIdx * 0.15);
      for (let s = 0; s < setCount; s++) {
        const progress = setCount > 1 ? s / (setCount - 1) : 1;
        const h = (0.55 + 0.45 * progress) * baseScale;
        bars.push({
          height: Math.min(1, Math.max(0.15, h)),
          top: isTop,
        });
      }
    });
  } else {
    const count = Math.max(1, Math.min(view.sets || 6, 18));
    for (let i = 0; i < count; i++) {
      bars.push({
        height: 0.5 + 0.5 * Math.sin((i / (count - 1 || 1)) * Math.PI),
        top: i === Math.floor(count / 2),
      });
    }
  }

  return {
    title: view.title,
    date: view.date,
    duration: view.duration,
    sets: view.sets,
    volume: view.volume,
    exercises: view.exercises,
    more: view.more,
    highlight: view.highlight,
    steps: view.steps,
    cardioDistanceKm: view.cardioDistanceKm,
    climb: bars,
  };
};
