import type { ISODate } from '@adaptive-macros/engine';
import { activeSession } from '../db';

export interface ActiveRestTimer {
  endsAt: number; // Unix timestamp in ms
  total: number;  // Initial duration in seconds
  exerciseName?: string;
}

export interface ActiveWorkoutState {
  hasActiveSession: boolean;
  sessionId: string | null;
  sessionName: string | null;
  date: ISODate | null;
  startedAt: string | null;
  setsCount: number;
  currentExerciseName: string | null;
  rest: ActiveRestTimer | null;
}

const defaultState: ActiveWorkoutState = {
  hasActiveSession: false,
  sessionId: null,
  sessionName: null,
  date: null,
  startedAt: null,
  setsCount: 0,
  currentExerciseName: null,
  rest: null,
};

let currentState: ActiveWorkoutState = { ...defaultState };
const listeners = new Set<(state: ActiveWorkoutState) => void>();

export const getActiveWorkoutState = (): ActiveWorkoutState => currentState;

export const updateActiveWorkoutState = (updates: Partial<ActiveWorkoutState>): void => {
  currentState = { ...currentState, ...updates };
  listeners.forEach((fn) => fn(currentState));
};

export const subscribeActiveWorkout = (listener: (state: ActiveWorkoutState) => void): (() => void) => {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
};

export const startRestCountdown = (totalSeconds: number, exerciseName?: string): void => {
  const endsAt = Date.now() + totalSeconds * 1000;
  updateActiveWorkoutState({
    rest: {
      endsAt,
      total: totalSeconds,
      exerciseName,
    },
  });
};

export const adjustRestCountdown = (deltaSeconds: number): void => {
  if (!currentState.rest) return;
  const newEndsAt = Math.max(Date.now(), currentState.rest.endsAt + deltaSeconds * 1000);
  const remaining = Math.max(0, Math.round((newEndsAt - Date.now()) / 1000));
  updateActiveWorkoutState({
    rest: {
      ...currentState.rest,
      endsAt: newEndsAt,
      total: Math.max(currentState.rest.total, remaining),
    },
  });
};

export const clearRestCountdown = (): void => {
  updateActiveWorkoutState({ rest: null });
};

/**
 * Synchronizes store state with active SQLite workout session.
 */
export const syncActiveSessionFromDb = async (): Promise<ActiveWorkoutState> => {
  try {
    const session = await activeSession();
    if (!session) {
      updateActiveWorkoutState({
        hasActiveSession: false,
        sessionId: null,
        sessionName: null,
        date: null,
        startedAt: null,
        setsCount: 0,
        currentExerciseName: null,
        rest: null,
      });
      return currentState;
    }

    const lastSet = session.sets[session.sets.length - 1];
    const currentExercise = lastSet ? lastSet.exerciseName : null;

    updateActiveWorkoutState({
      hasActiveSession: true,
      sessionId: session.id,
      sessionName: session.name,
      date: session.date,
      startedAt: session.startedAt,
      setsCount: session.sets.length,
      currentExerciseName: currentExercise,
    });
    return currentState;
  } catch {
    return currentState;
  }
};
