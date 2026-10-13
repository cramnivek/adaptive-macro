import { describe, expect, it } from 'vitest';
import type { LoggedSet } from '../db';
import { shareSummary } from '../shareCard';

let id = 0;
const set = (exerciseName: string, weightKg: number | null, reps: number, setType: LoggedSet['setType'] = 'normal'): LoggedSet => {
  id += 1;
  return { id: `s${id}`, exerciseName, bodyweightBased: weightKg === null, setIndex: id, weightKg, reps, setType, rpe: null };
};

const base = {
  title: 'Push',
  date: '2026-10-11',
  startedAt: '2026-10-11T18:00:00',
  finishedAt: new Date('2026-10-11T19:12:00'),
  units: 'metric' as const,
  milestone: null,
};

describe('shareSummary', () => {
  const sets = [
    set('Bench Press (Barbell)', 20, 10, 'warmup'),
    set('Bench Press (Barbell)', 100, 5),
    set('Bench Press (Barbell)', 100, 6),
    set('Bench Press (Barbell)', 95, 8),
    set('Pull Up', null, 12),
    set('Pull Up', null, 9),
  ];

  it('counts working sets and their volume, leaving warm-ups out', () => {
    const summary = shareSummary({ ...base, sets });
    expect(summary.sets).toBe(5);
    // 100×5 + 100×6 + 95×8; the 20×10 warm-up is not counted.
    expect(summary.volume).toBe('1,860 kg');
  });

  it('quotes the heaviest set of each lift, the most reps breaking a tie', () => {
    const summary = shareSummary({ ...base, sets });
    expect(summary.exercises[0]).toEqual({ name: 'Bench Press (Barbell)', sets: 3, best: '100 kg × 6' });
  });

  it('quotes reps for a lift done with no added weight', () => {
    expect(shareSummary({ ...base, sets }).exercises[1]).toEqual({ name: 'Pull Up', sets: 2, best: '12 reps' });
  });

  it('keeps the order the lifts were done in', () => {
    expect(shareSummary({ ...base, sets }).exercises.map((e) => e.name)).toEqual(['Bench Press (Barbell)', 'Pull Up']);
  });

  it('says how long it took, in hours past an hour', () => {
    expect(shareSummary({ ...base, sets }).duration).toBe('1 h 12 min');
    expect(shareSummary({ ...base, finishedAt: new Date('2026-10-11T18:45:00'), sets }).duration).toBe('45 min');
  });

  it('speaks pounds to someone in pounds', () => {
    const summary = shareSummary({ ...base, units: 'imperial', sets: [set('Squat', 100, 5)] });
    expect(summary.exercises[0].best).toBe('220.5 lb × 5');
    expect(summary.volume).toBe('1,102 lb');
  });

  it('leaves volume off a bodyweight-only day rather than claiming zero', () => {
    expect(shareSummary({ ...base, sets: [set('Push-Up', null, 20)] }).volume).toBeNull();
  });

  it('names three lifts and counts the rest', () => {
    const many = Array.from({ length: 8 }, (_, i) => set(`Lift ${i}`, 50, 10));
    const summary = shareSummary({ ...base, sets: many });
    expect(summary.exercises).toHaveLength(3);
    expect(summary.more).toBe(5);
  });

  it('carries the day’s milestone, in the words the app already uses for it', () => {
    const summary = shareSummary({ ...base, sets, milestone: { kind: 'load', value: 100, exercise: 'Bench Press (Barbell)' } });
    expect(summary.highlight).toEqual({ label: 'BENCH PRESS (BARBELL)', figure: '100 kg' });
  });
});

describe('the climb', () => {
  it('stands every working set against the biggest, in the order they were done', () => {
    const summary = shareSummary({
      ...base,
      sets: [set('Squat', 50, 10, 'warmup'), set('Squat', 100, 5), set('Squat', 50, 5)],
    });
    // The warm-up is no part of the day's shape, and the lighter set is half the taller one.
    expect(summary.climb.map((bar) => bar.height)).toEqual([1, 0.5]);
  });

  it('marks the lift that moved the most, so the day’s real work is the red block', () => {
    const summary = shareSummary({
      ...base,
      sets: [set('Squat', 100, 5), set('Squat', 100, 5), set('Curl', 20, 10)],
    });
    expect(summary.climb.map((bar) => bar.top)).toEqual([true, true, false]);
  });

  it('draws a day with no weight on anything by its reps rather than flat', () => {
    const summary = shareSummary({ ...base, sets: [set('Pull Up', null, 10), set('Pull Up', null, 5)] });
    expect(summary.climb.map((bar) => bar.height)).toEqual([1, 0.5]);
  });

  it('has nothing to draw for a day with no working sets', () => {
    expect(shareSummary({ ...base, sets: [set('Squat', 60, 10, 'warmup')] }).climb).toEqual([]);
  });
});
