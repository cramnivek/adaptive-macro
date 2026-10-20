import { describe, expect, it } from 'vitest';
import { dumbbellBreakdown, dumbbellLoad, dumbbellNote, repsColumnLabel, weightColumnLabel } from '../dumbbellLoad';

describe('dumbbellLoad', () => {
  it('leaves non-dumbbell exercises alone', () => {
    expect(dumbbellLoad('Squat (Barbell)')).toBeNull();
    expect(dumbbellLoad('Lat Pulldown (Cable)', 'Cable')).toBeNull();
  });

  it('treats ordinary dumbbell movements as a pair', () => {
    expect(dumbbellLoad('Bench Press (Dumbbell)')).toBe('pair');
    expect(dumbbellLoad('Hammer Curl (Dumbbell)')).toBe('pair');
    expect(dumbbellLoad('DB Shoulder Press')).toBe('pair');
  });

  it('recognises one bell held in both hands', () => {
    expect(dumbbellLoad('Goblet Squat (Dumbbell)')).toBe('single');
    expect(dumbbellLoad('Heel-Elevated Goblet Squat')).toBe('single');
    expect(dumbbellLoad('Dumbbell Pullover')).toBe('single');
  });

  it('counts one-arm movements as one side at a time', () => {
    expect(dumbbellLoad('Dumbbell Row')).toBe('perSide');
    expect(dumbbellLoad('Single-Arm Row (Dumbbell)')).toBe('perSide');
    expect(dumbbellLoad('Concentration Curl (Dumbbell)')).toBe('perSide');
    expect(dumbbellLoad('Meadows Row (Dumbbell)')).toBe('perSide');
  });

  it('keeps chest-supported rows as a pair', () => {
    expect(dumbbellLoad('Chest-Supported Row (Dumbbell)')).toBe('pair');
  });

  it('counts unilateral and alternating movements per side', () => {
    expect(dumbbellLoad('Walking Lunge (Dumbbell)')).toBe('perSide');
    expect(dumbbellLoad('Step-Up (Dumbbell)')).toBe('perSide');
    expect(dumbbellLoad('Single-Leg Romanian Deadlift (Dumbbell)')).toBe('perSide');
    expect(dumbbellLoad('Alternating Curl (Dumbbell)')).toBe('perSide');
  });

  it('falls back to the catalogue equipment when the name does not say', () => {
    expect(dumbbellLoad('Bulgarian Split Squat', 'Dumbbell')).toBe('perSide');
    expect(dumbbellLoad('Bulgarian Split Squat')).toBeNull();
  });
});

describe('column labels', () => {
  it('says EACH for a pair and per side, not for a single bell', () => {
    expect(weightColumnLabel('lb', 'pair')).toBe('LB EACH');
    expect(weightColumnLabel('kg', 'perSide')).toBe('KG EACH');
    expect(weightColumnLabel('lb', 'single')).toBe('LB');
    expect(weightColumnLabel('lb', null)).toBe('LB');
  });

  it('marks reps per side only when they are', () => {
    expect(repsColumnLabel('perSide')).toBe('REPS/SIDE');
    expect(repsColumnLabel('pair')).toBe('REPS');
  });

  it('has a note for every kind', () => {
    for (const kind of ['pair', 'single', 'perSide'] as const) expect(dumbbellNote(kind).length).toBeGreaterThan(10);
  });
});

describe('dumbbellBreakdown', () => {
  it('totals a pair', () => {
    expect(dumbbellBreakdown('pair', '32.5', '10', 'LB')).toBe('= 65 lb total, both dumbbells');
  });

  it('shows both sides of a one-sided movement, with reps when there are some', () => {
    expect(dumbbellBreakdown('perSide', '105.0', '13', 'lb')).toBe('L 105 × 13 · R 105 × 13');
    expect(dumbbellBreakdown('perSide', '24', '', 'kg')).toBe('L 24 · R 24');
  });

  it('adds nothing for a single bell, an empty or zero weight, or a non-dumbbell lift', () => {
    expect(dumbbellBreakdown('single', '30', '10', 'kg')).toBeNull();
    expect(dumbbellBreakdown('pair', '', '10', 'kg')).toBeNull();
    expect(dumbbellBreakdown('pair', '0', '10', 'kg')).toBeNull();
    expect(dumbbellBreakdown(null, '100', '5', 'kg')).toBeNull();
  });

  it('reads a decimal comma', () => {
    expect(dumbbellBreakdown('pair', '12,5', '8', 'kg')).toBe('= 25 kg total, both dumbbells');
  });
});
