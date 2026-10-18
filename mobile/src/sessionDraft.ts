import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SetType } from '@adaptive-macros/engine';
import type { CardioMode } from './cardio';

export interface RowDraft {
  key: string;
  id: string | null;
  weight: string;
  reps: string;
  setType: SetType;
  done: boolean;
  rpe: number | null;
  isCardio?: boolean;
  cardioMode?: CardioMode;
  speed?: string;
  incline?: string;
  time?: string;
  distance?: string;
}

export interface BlockDraft {
  name: string;
  bodyweightBased: boolean;
  isCardio?: boolean;
  cardioMode?: CardioMode;
  supersetGroup?: string | null;
  target: {
    sets: number;
    reps: string | null;
    targetTime?: string | null;
    targetDistance?: number | null;
    targetSpeed?: number | null;
    targetIncline?: number | null;
  } | null;
  rows: RowDraft[];
}

const DRAFT_PREFIX = 'adaptive_active_workout_draft_v1_';

/**
 * Saves the in-progress state of an active workout session to persistent storage.
 * This preserves typed weights, rep numbers, custom sets, and cardio metrics
 * when the mobile browser or OS backgrounds or reloads the tab.
 */
export const saveWorkoutDraft = async (sessionId: string, blocks: BlockDraft[]): Promise<void> => {
  if (!sessionId || !blocks) return;
  const key = `${DRAFT_PREFIX}${sessionId}`;
  try {
    const payload: BlockDraft[] = blocks.map((b) => ({
      name: b.name,
      bodyweightBased: b.bodyweightBased,
      isCardio: b.isCardio,
      cardioMode: b.cardioMode,
      supersetGroup: b.supersetGroup ?? null,
      target: b.target,
      rows: b.rows.map((r) => ({
        key: r.key,
        id: r.id,
        weight: r.weight,
        reps: r.reps,
        setType: r.setType,
        done: r.done,
        rpe: r.rpe,
        isCardio: r.isCardio,
        cardioMode: r.cardioMode,
        speed: r.speed,
        incline: r.incline,
        time: r.time,
        distance: r.distance,
      })),
    }));

    const json = JSON.stringify(payload);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, json);
    }
    await AsyncStorage.setItem(key, json);
  } catch (err) {
    console.warn('Failed to save workout draft:', err);
  }
};

/**
 * Retrieves the saved in-progress draft for an active workout session.
 * Returns null if no draft exists or if the draft was cleared.
 */
export const loadWorkoutDraft = async (sessionId: string): Promise<BlockDraft[] | null> => {
  if (!sessionId) return null;
  const key = `${DRAFT_PREFIX}${sessionId}`;
  try {
    let json: string | null = null;
    if (typeof localStorage !== 'undefined') {
      json = localStorage.getItem(key);
    }
    if (!json) {
      json = await AsyncStorage.getItem(key);
    }
    if (!json) return null;
    const parsed = JSON.parse(json) as BlockDraft[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Removes the saved workout draft once the workout is finished or discarded.
 */
export const clearWorkoutDraft = async (sessionId: string): Promise<void> => {
  if (!sessionId) return;
  const key = `${DRAFT_PREFIX}${sessionId}`;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    await AsyncStorage.removeItem(key);
  } catch {}
};
