import { describe, expect, it } from 'vitest';
import type { LoggedSet } from '../db';
import { routineExercisesFromSets } from '../routineFromSession';

let n = 0;
const set = (over: Partial<LoggedSet>): LoggedSet => ({
  id: String(n++),
  exerciseName: 'Bench Press',
  bodyweightBased: false,
  setIndex: 0,
  weightKg: 60,
  reps: 8,
  setType: 'normal',
  rpe: null,
  ...over,
});

describe('routineExercisesFromSets', () => {
  it('drops warm-ups and counts working sets', () => {
    const out = routineExercisesFromSets([
      set({ setType: 'warmup', reps: 12 }),
      set({}),
      set({}),
      set({}),
    ]);
    expect(out).toEqual([
      { name: 'Bench Press', bodyweightBased: false, targetSets: 3, targetReps: '8' },
    ]);
  });

  it('writes a range when reps vary', () => {
    const [ex] = routineExercisesFromSets([set({ reps: 8 }), set({ reps: 10 }), set({ reps: 9 })]);
    expect(ex.targetReps).toBe('8-10');
  });

  it('keeps an exercise that only has warm-ups', () => {
    const [ex] = routineExercisesFromSets([set({ setType: 'warmup', reps: 5 })]);
    expect(ex.targetSets).toBe(1);
    expect(ex.targetReps).toBe('5');
  });

  it('keeps exercise order and bodyweight flag', () => {
    const out = routineExercisesFromSets([
      set({ exerciseName: 'Pull Up', bodyweightBased: true, weightKg: null }),
      set({ exerciseName: 'Row' }),
      set({ exerciseName: 'Pull Up', bodyweightBased: true, weightKg: null }),
    ]);
    expect(out.map((e) => e.name)).toEqual(['Pull Up', 'Row']);
    expect(out[0].bodyweightBased).toBe(true);
    expect(out[0].targetSets).toBe(2);
  });

  it('turns cardio into time, speed and incline targets', () => {
    const [ex] = routineExercisesFromSets([
      set({
        exerciseName: 'Treadmill',
        isCardio: true,
        cardioMode: 'treadmill',
        durationSeconds: 1500,
        speedKph: 6,
        inclinePct: 2,
        distanceKm: null,
      }),
    ]);
    expect(ex).toMatchObject({
      isCardio: true,
      cardioMode: 'treadmill',
      targetSets: 1,
      targetTime: '25m',
      targetSpeed: 6,
      targetIncline: 2,
    });
  });

  it('never saves a zero-minute cardio target', () => {
    const [ex] = routineExercisesFromSets([
      set({ exerciseName: 'Treadmill', isCardio: true, cardioMode: 'treadmill', durationSeconds: 20 }),
    ]);
    expect(ex.targetTime).toBe('1m');
  });

  it('returns nothing for no sets', () => {
    expect(routineExercisesFromSets([])).toEqual([]);
  });
});
