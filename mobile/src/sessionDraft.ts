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
export const LATEST_ACTIVE_DRAFT_KEY = 'adaptive_latest_active_workout_draft_v1';

const serializeDraftBlocks = (blocks: BlockDraft[]): BlockDraft[] => {
  return blocks.map((b) => ({
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
};

/**
 * Synchronously writes the in-progress workout draft to localStorage.
 * Guarantees zero latency so unmounting or navigating away never loses
 * typed weights, custom reps, or added exercises.
 */
export const saveWorkoutDraftSync = (sessionId: string, blocks: BlockDraft[]): void => {
  if (!sessionId || !blocks || blocks.length === 0) return;
  const key = `${DRAFT_PREFIX}${sessionId}`;
  try {
    const payload = serializeDraftBlocks(blocks);
    const json = JSON.stringify(payload);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, json);
      localStorage.setItem(LATEST_ACTIVE_DRAFT_KEY, json);
    }
  } catch (err) {
    console.warn('Failed to save workout draft synchronously:', err);
  }
};

/**
 * Saves the in-progress state of an active workout session to persistent storage.
 * Writes synchronously to localStorage and persists to AsyncStorage.
 */
export const saveWorkoutDraft = async (sessionId: string, blocks: BlockDraft[]): Promise<void> => {
  if (!sessionId || !blocks || blocks.length === 0) return;
  const key = `${DRAFT_PREFIX}${sessionId}`;
  try {
    const payload = serializeDraftBlocks(blocks);
    const json = JSON.stringify(payload);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, json);
      localStorage.setItem(LATEST_ACTIVE_DRAFT_KEY, json);
    }
    await AsyncStorage.setItem(key, json);
    await AsyncStorage.setItem(LATEST_ACTIVE_DRAFT_KEY, json);
  } catch (err) {
    console.warn('Failed to save workout draft:', err);
  }
};

/**
 * Retrieves the saved in-progress draft for an active workout session.
 * Checks sessionId key first, then AsyncStorage, and falls back to latest active draft.
 */
export const loadWorkoutDraft = async (sessionId?: string | null): Promise<BlockDraft[] | null> => {
  try {
    let json: string | null = null;
    if (sessionId) {
      const key = `${DRAFT_PREFIX}${sessionId}`;
      if (typeof localStorage !== 'undefined') {
        json = localStorage.getItem(key);
      }
      if (!json) {
        json = await AsyncStorage.getItem(key);
      }
    }

    if (!json) {
      if (typeof localStorage !== 'undefined') {
        json = localStorage.getItem(LATEST_ACTIVE_DRAFT_KEY);
      }
      if (!json) {
        json = await AsyncStorage.getItem(LATEST_ACTIVE_DRAFT_KEY);
      }
    }

    if (!json) return null;
    const parsed = JSON.parse(json) as BlockDraft[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
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
      localStorage.removeItem(LATEST_ACTIVE_DRAFT_KEY);
    }
    await AsyncStorage.removeItem(key);
    await AsyncStorage.removeItem(LATEST_ACTIVE_DRAFT_KEY);
  } catch {}
};
