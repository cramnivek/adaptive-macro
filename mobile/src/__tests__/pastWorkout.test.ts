import { describe, expect, it } from 'vitest';
import type { LoggedSet } from '../db';
import { groupByExercise, setLine } from '../pastWorkout';

let id = 0;
const set = (
  exerciseName: string,
  weightKg: number | null,
  reps: number,
  rpe: number | null = null,
  setType: LoggedSet['setType'] = 'normal',
): LoggedSet => {
  id += 1;
  return { id: `s${id}`, exerciseName, bodyweightBased: weightKg === null, setIndex: id, weightKg, reps, setType, rpe };
};

describe('groupByExercise', () => {
  it('keeps exercises in the order they were first done', () => {
    const groups = groupByExercise([set('Squat', 100, 5), set('Row', 60, 8), set('Curl', 15, 12)]);
    expect(groups.map((g) => g.name)).toEqual(['Squat', 'Row', 'Curl']);
  });

  it('puts a later set of an earlier exercise in that exercise\'s group', () => {
    const first = set('Squat', 100, 5);
    const row = set('Row', 60, 8);
    const again = set('Squat', 100, 4);
    const groups = groupByExercise([first, row, again]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.sets).toEqual([first, again]);
    expect(groups[1]?.sets).toEqual([row]);
  });

  it('keeps warm-ups, because this is the full record', () => {
    const warm = set('Squat', 20, 10, null, 'warmup');
    expect(groupByExercise([warm, set('Squat', 100, 5)])[0]?.sets[0]).toBe(warm);
  });

  it('is empty for no sets', () => {
    expect(groupByExercise([])).toEqual([]);
  });
});

describe('setLine', () => {
  it('writes weight and reps in kilograms', () => {
    expect(setLine(set('Squat', 80, 8), 'metric')).toBe('80 kg × 8');
  });

  it('converts to pounds and rounds to a tenth', () => {
    expect(setLine(set('Squat', 100, 5), 'imperial')).toBe('220.5 lb × 5');
  });

  it('keeps a tenth in kilograms when there is one', () => {
    expect(setLine(set('Press', 42.5, 6), 'metric')).toBe('42.5 kg × 6');
  });

  it('never prints a trailing .0', () => {
    expect(setLine(set('Squat', 100, 5), 'metric')).toBe('100 kg × 5');
    expect(setLine(set('Squat', 100, 5), 'metric')).not.toContain('.0');
  });

  it('gives a set with no added load as reps', () => {
    expect(setLine(set('Pull Up', null, 12), 'metric')).toBe('12 reps');
  });

  it('treats a zero weight as no added load', () => {
    expect(setLine(set('Pull Up', 0, 12), 'imperial')).toBe('12 reps');
  });

  it('says "1 rep" for a single bodyweight rep', () => {
    expect(setLine(set('Pull Up', null, 1), 'metric')).toBe('1 rep');
  });

  it('appends the RPE when one was recorded', () => {
    expect(setLine(set('Squat', 80, 8, 8), 'metric')).toBe('80 kg × 8 @ 8');
    expect(setLine(set('Squat', 80, 8, 8.5), 'metric')).toBe('80 kg × 8 @ 8.5');
    expect(setLine(set('Pull Up', null, 10, 9), 'metric')).toBe('10 reps @ 9');
  });
});
