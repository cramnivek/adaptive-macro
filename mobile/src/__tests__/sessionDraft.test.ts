import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockStore = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (key: string, val: string) => {
      mockStore.set(key, val);
    }),
    getItem: vi.fn(async (key: string) => {
      return mockStore.get(key) ?? null;
    }),
    removeItem: vi.fn(async (key: string) => {
      mockStore.delete(key);
    }),
    clear: vi.fn(async () => {
      mockStore.clear();
    }),
  },
}));

import {
  clearWorkoutDraft,
  loadWorkoutDraft,
  saveWorkoutDraft,
  type BlockDraft,
} from '../sessionDraft';

describe('sessionDraft', () => {
  beforeEach(async () => {
    mockStore.clear();
    await AsyncStorage.clear();
  });

  const sampleBlocks: BlockDraft[] = [
    {
      name: 'Bench Press (Barbell)',
      bodyweightBased: false,
      target: { sets: 4, reps: '6-10' },
      rows: [
        {
          key: 'r1',
          id: 'set-1',
          weight: '45.0',
          reps: '10',
          setType: 'warmup',
          done: true,
          rpe: null,
        },
        {
          key: 'r2',
          id: null,
          weight: '197.1',
          reps: '8',
          setType: 'normal',
          done: false,
          rpe: null,
        },
      ],
    },
    {
      name: 'Treadmill Run',
      bodyweightBased: false,
      isCardio: true,
      cardioMode: 'treadmill',
      target: null,
      rows: [
        {
          key: 'r3',
          id: null,
          weight: '',
          reps: '0',
          setType: 'normal',
          done: false,
          rpe: null,
          isCardio: true,
          cardioMode: 'treadmill',
          speed: '10.5',
          incline: '2.0',
          time: '15',
        },
      ],
    },
  ];

  it('saves and restores an in-progress workout draft', async () => {
    await saveWorkoutDraft('session-123', sampleBlocks);

    const restored = await loadWorkoutDraft('session-123');
    expect(restored).not.toBeNull();
    expect(restored).toHaveLength(2);
    expect(restored![0].name).toBe('Bench Press (Barbell)');
    expect(restored![0].rows).toHaveLength(2);
    expect(restored![0].rows[0].weight).toBe('45.0');
    expect(restored![0].rows[0].done).toBe(true);
    expect(restored![0].rows[1].weight).toBe('197.1');
    expect(restored![0].rows[1].reps).toBe('8');
    expect(restored![0].rows[1].done).toBe(false);

    expect(restored![1].isCardio).toBe(true);
    expect(restored![1].rows[0].speed).toBe('10.5');
  });

  it('returns null when no draft exists for a session id', async () => {
    const missing = await loadWorkoutDraft('non-existent');
    expect(missing).toBeNull();
  });

  it('clears the workout draft completely', async () => {
    await saveWorkoutDraft('session-999', sampleBlocks);
    expect(await loadWorkoutDraft('session-999')).not.toBeNull();

    await clearWorkoutDraft('session-999');
    expect(await loadWorkoutDraft('session-999')).toBeNull();
  });

  it('restores draft via latest fallback key when sessionId is omitted', async () => {
    await saveWorkoutDraft('session-abc', sampleBlocks);
    const restored = await loadWorkoutDraft();
    expect(restored).not.toBeNull();
    expect(restored).toHaveLength(2);
  });
});
