import type { LoggedSet } from './db';
import { groupByExercise } from './pastWorkout';

/** One exercise of a routine, as `createRoutine` takes it. */
export interface RoutineExerciseDraft {
  name: string;
  bodyweightBased: boolean;
  targetSets: number;
  targetReps: string | null;
  isCardio?: boolean;
  cardioMode?: 'treadmill' | 'outside' | null;
  targetTime?: string | null;
  targetDistance?: number | null;
  targetSpeed?: number | null;
  targetIncline?: number | null;
}

/**
 * The routine a finished session implies: its exercises in the order they were
 * done, with the sets and reps actually worked as the targets.
 *
 * Warm-ups are not part of the plan, so they are left out — unless an exercise
 * has nothing else, when they are the only record of it. Reps become one number
 * when every set matched and a range when they did not.
 */
export const routineExercisesFromSets = (sets: LoggedSet[]): RoutineExerciseDraft[] =>
  groupByExercise(sets).map(({ name, sets: group }) => {
    const first = group[0];
    if (first.isCardio) {
      const seconds = first.durationSeconds ?? null;
      return {
        name,
        bodyweightBased: false,
        targetSets: 1,
        targetReps: null,
        isCardio: true,
        cardioMode: first.cardioMode ?? 'treadmill',
        targetTime: seconds ? `${Math.max(1, Math.round(seconds / 60))}m` : null,
        targetDistance: first.distanceKm ?? null,
        targetSpeed: first.speedKph ?? null,
        targetIncline: first.inclinePct ?? null,
      };
    }

    const working = group.filter((set) => set.setType !== 'warmup');
    const counted = working.length > 0 ? working : group;
    const reps = counted.map((set) => set.reps);
    const low = Math.min(...reps);
    const high = Math.max(...reps);
    return {
      name,
      bodyweightBased: first.bodyweightBased,
      targetSets: counted.length,
      targetReps: low === high ? String(low) : `${low}-${high}`,
    };
  });
