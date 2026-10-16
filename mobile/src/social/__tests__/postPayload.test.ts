import { describe, expect, it } from 'vitest';
import type { LoggedSet } from '../../db';
import { type FinishedWorkout, postPayload, postView } from '../postPayload';

let id = 0;
const set = (exerciseName: string, weightKg: number | null, reps: number, setType: LoggedSet['setType'] = 'normal'): LoggedSet => {
  id += 1;
  return { id: `s${id}`, exerciseName, bodyweightBased: weightKg === null, setIndex: id, weightKg, reps, setType, rpe: null };
};

const workout = (overrides: Partial<FinishedWorkout> = {}): FinishedWorkout => ({
  sessionId: 'session-1',
  title: 'Push',
  date: '2026-10-11',
  startedAt: '2026-10-11T18:00:00',
  finishedAt: new Date('2026-10-11T19:12:00'),
  sets: [
    set('Bench Press (Barbell)', 20, 10, 'warmup'),
    set('Bench Press (Barbell)', 100, 5),
    set('Bench Press (Barbell)', 100, 6),
    set('Bench Press (Barbell)', 95, 8),
    set('Pull Up', null, 12),
    set('Pull Up', null, 9),
  ],
  milestone: null,
  ...overrides,
});

describe('postPayload', () => {
  it('stores kilograms and minutes, leaving warm-ups out', () => {
    const row = postPayload(workout(), null);
    expect(row).toMatchObject({ session_id: 'session-1', performed_on: '2026-10-11', duration_min: 72, sets: 5, volume_kg: 1860 });
  });

  it('keeps each lift’s best set as numbers', () => {
    const row = postPayload(workout(), null);
    expect(row.exercises).toEqual([
      { name: 'Bench Press (Barbell)', sets: 3, best_kg: 100, best_reps: 6 },
      { name: 'Pull Up', sets: 2, best_kg: null, best_reps: 12 },
    ]);
  });

  it('stores no volume for a bodyweight-only day', () => {
    expect(postPayload(workout({ sets: [set('Push-Up', null, 20)] }), null).volume_kg).toBeNull();
  });

  it('trims the caption and stores none for a blank one', () => {
    expect(postPayload(workout(), '  felt strong  ').caption).toBe('felt strong');
    expect(postPayload(workout(), '   ').caption).toBeNull();
  });

  it('refuses a caption over 500 characters', () => {
    expect(postPayload(workout(), 'x'.repeat(500)).caption).toHaveLength(500);
    expect(() => postPayload(workout(), 'x'.repeat(501))).toThrow('A caption can be at most 500 characters.');
  });

  it('cuts a title to 80 characters and never sends an empty one', () => {
    expect(postPayload(workout({ title: 'y'.repeat(90) }), null).title).toHaveLength(80);
    expect(postPayload(workout({ title: '  ' }), null).title).toBe('Workout');
  });

  it('keeps the day’s milestone as the engine made it', () => {
    const milestone = { kind: 'load' as const, value: 100, exercise: 'Bench Press (Barbell)' };
    expect(postPayload(workout({ milestone }), null).highlight).toEqual(milestone);
  });
});

describe('postView', () => {
  it('speaks pounds to a reader in pounds, whatever the poster used', () => {
    const view = postView(postPayload(workout({ sets: [set('Squat', 100, 5)] }), null), 'imperial');
    expect(view.exercises[0].best).toBe('220.5 lb × 5');
    expect(view.volume).toBe('1,102 lb');
  });

  it('quotes reps for a lift with no added load', () => {
    expect(postView(postPayload(workout(), null), 'metric').exercises[1].best).toBe('12 reps');
  });

  it('shows three lifts and counts the rest', () => {
    const many = Array.from({ length: 5 }, (_, i) => set(`Lift ${i}`, 50, 10));
    const view = postView(postPayload(workout({ sets: many }), null), 'metric');
    expect(view.exercises).toHaveLength(3);
    expect(view.more).toBe(2);
  });

  it('phrases the milestone in the reader’s units', () => {
    const row = postPayload(workout({ milestone: { kind: 'load', value: 100, exercise: 'Bench Press (Barbell)' } }), null);
    expect(postView(row, 'metric').highlight).toEqual({ label: 'BENCH PRESS (BARBELL)', figure: '100 kg' });
    expect(postView(row, 'imperial').highlight?.figure).toMatch(/ lb$/);
  });

  it('carries the caption and the duration in words', () => {
    const view = postView(postPayload(workout(), 'felt strong'), 'metric');
    expect(view.caption).toBe('felt strong');
    expect(view.duration).toBe('1 h 12 min');
  });

  it('stores cardio as 0 sets and 0 reps without inflating post sets', () => {
    const cardioSet: LoggedSet = {
      id: 'c1',
      exerciseName: 'Treadmill',
      bodyweightBased: false,
      setIndex: 1,
      weightKg: null,
      reps: 0,
      setType: 'normal',
      rpe: null,
      isCardio: true,
      cardioMode: 'treadmill',
    };
    const row = postPayload(workout({ sets: [cardioSet] }), null);
    expect(row.sets).toBe(0);
    expect(row.exercises[0]).toEqual({ name: 'Treadmill', sets: 0, best_kg: null, best_reps: 0 });

    const view = postView(row, 'metric');
    expect(view.sets).toBe(0);
    expect(view.exercises[0].best).toBe('Cardio');
  });
});

describe('cardio a name cannot give away', () => {
  // The Cardio tab takes any name, so detectCardio does not know "Ski erg". What
  // the writer knew is in the row: no sets, no weight, no reps.
  const row = {
    session_id: 's1',
    title: 'Conditioning',
    performed_on: '2026-10-12',
    duration_min: 30,
    sets: 0,
    volume_kg: null,
    exercises: [{ name: 'Ski erg', sets: 0, best_kg: null, best_reps: 0 }],
    highlight: null,
    caption: null,
  };

  it('is read back as cardio rather than as nothing', () => {
    const view = postView(row, 'metric');
    expect(view.exercises[0]).toEqual({ name: 'Ski erg', sets: 0, best: 'Cardio', isCardio: true, detail: 'Completed' });
  });

  it('still says the reps of a bodyweight lift, which always has its set', () => {
    const view = postView({ ...row, sets: 2, exercises: [{ name: 'Pull Up', sets: 2, best_kg: null, best_reps: 12 }] }, 'metric');
    expect(view.exercises[0].best).toBe('12 reps');
  });
});

describe('routineExercisesFromPost', () => {
  it('converts post exercises into routine exercise drafts', async () => {
    const { routineExercisesFromPost } = await import('../postPayload');
    const lifts = [
      { name: 'Bench Press (Barbell)', sets: 4, best_kg: 100, best_reps: 8 },
      { name: 'Pull Up', sets: 3, best_kg: null, best_reps: 10 },
      { name: 'Treadmill', sets: 0, best_kg: null, best_reps: 0 },
    ];
    const drafts = routineExercisesFromPost(lifts);
    expect(drafts).toEqual([
      { name: 'Bench Press (Barbell)', bodyweightBased: false, targetSets: 4, targetReps: '8', isCardio: false },
      { name: 'Pull Up', bodyweightBased: true, targetSets: 3, targetReps: '10', isCardio: false },
      { name: 'Treadmill', bodyweightBased: false, targetSets: 3, targetReps: null, isCardio: true },
    ]);
  });

  it('preserves full rawExercises list in postView', () => {
    const row = postPayload(workout(), null);
    const view = postView(row, 'metric');
    expect(view.rawExercises).toBeDefined();
    expect(view.rawExercises).toHaveLength(2);
    expect(view.rawExercises?.[0].name).toBe('Bench Press (Barbell)');
    expect(view.rawExercises?.[1].name).toBe('Pull Up');
  });
});

