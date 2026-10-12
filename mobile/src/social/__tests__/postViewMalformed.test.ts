import { describe, expect, it } from 'vitest';
import { type PostRow, postView } from '../postPayload';

/**
 * A row can reach a reader written by an old app, by hand, or before the
 * database checked its shape. None of it may take the screen down.
 */

const row = (overrides: Record<string, unknown> = {}): PostRow =>
  ({
    session_id: 's1',
    title: 'Push',
    performed_on: '2026-10-11',
    duration_min: 72,
    sets: 5,
    volume_kg: 1860,
    exercises: [{ name: 'Bench Press (Barbell)', sets: 3, best_kg: 100, best_reps: 6 }],
    highlight: null,
    caption: null,
    ...overrides,
  }) as PostRow;

describe('postView on a malformed row', () => {
  it('treats exercises that are not an array as none', () => {
    for (const exercises of [null, undefined, 'Bench', 7, { name: 'Bench' }]) {
      const view = postView(row({ exercises }), 'metric');
      expect(view.exercises).toEqual([]);
      expect(view.more).toBe(0);
    }
  });

  it('skips an element that is not an object with a string name', () => {
    const exercises = [
      null,
      'Bench',
      7,
      [],
      { sets: 3, best_kg: 100, best_reps: 6 },
      { name: 4, sets: 3, best_kg: 100, best_reps: 6 },
      { name: 'Squat', sets: 2, best_kg: 140, best_reps: 5 },
    ];
    const view = postView(row({ exercises }), 'metric');
    expect(view.exercises).toEqual([{ name: 'Squat', sets: 2, best: '140 kg × 5' }]);
    expect(view.more).toBe(0);
  });

  it('gives 0 for a set count or rep count that is not a number', () => {
    const view = postView(row({ exercises: [{ name: 'Bench', sets: '3', best_kg: null, best_reps: 'six' }] }), 'metric');
    expect(view.exercises).toEqual([{ name: 'Bench', sets: 0, best: '0 reps' }]);
  });

  it('gives no weight for one that is not a number, and quotes the reps', () => {
    for (const best_kg of ['100', Number.NaN, Number.POSITIVE_INFINITY, {}, undefined]) {
      const view = postView(row({ exercises: [{ name: 'Bench', sets: 3, best_kg, best_reps: 6 }] }), 'metric');
      expect(view.exercises).toEqual([{ name: 'Bench', sets: 3, best: '6 reps' }]);
    }
  });

  it('counts only the elements it can show toward the overflow', () => {
    const lifts = Array.from({ length: 5 }, (_, i) => ({ name: `L${i}`, sets: 1, best_kg: 10, best_reps: 5 }));
    const view = postView(row({ exercises: [null, ...lifts] }), 'metric', 3);
    expect(view.exercises.map((e) => e.name)).toEqual(['L0', 'L1', 'L2']);
    expect(view.more).toBe(2);
  });

  it('treats a highlight it cannot describe as none', () => {
    const bad = [
      'load',
      7,
      [],
      {},
      { kind: 'bogus', value: 1 },
      { kind: 'sessions' },
      { kind: 'sessions', value: '50' },
      { kind: 'volume', value: Number.NaN },
      { kind: 'load', value: 100, exercise: 7 },
    ];
    for (const highlight of bad) expect(postView(row({ highlight }), 'metric').highlight).toBeNull();
  });

  it('still shows a highlight that is sound', () => {
    expect(postView(row({ highlight: { kind: 'sessions', value: 50 } }), 'metric').highlight).toEqual({
      label: 'SESSIONS',
      figure: '50',
    });
  });
});
