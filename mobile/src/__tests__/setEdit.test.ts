import { describe, expect, it } from 'vitest';
import { readSetEdit } from '../setEdit';

describe('readSetEdit', () => {
  it('takes kilograms as typed', () => {
    expect(readSetEdit('80', '8', 'metric', false)).toEqual({ weightKg: 80, reps: 8 });
  });

  it('accepts a decimal comma', () => {
    expect(readSetEdit('82,5', '5', 'metric', false)).toEqual({ weightKg: 82.5, reps: 5 });
  });

  it('converts pounds to kilograms', () => {
    const edit = readSetEdit('100', '5', 'imperial', false);
    if ('problem' in edit) throw new Error(edit.problem);
    expect(edit.weightKg).toBeCloseTo(45.359, 2);
    expect(edit.reps).toBe(5);
  });

  it('gives no added load for an empty weight on a bodyweight exercise', () => {
    expect(readSetEdit('', '12', 'metric', true)).toEqual({ weightKg: null, reps: 12 });
    expect(readSetEdit('   ', '12', 'metric', true)).toEqual({ weightKg: null, reps: 12 });
  });

  it('asks for a weight on a loaded lift', () => {
    expect(readSetEdit('', '8', 'metric', false)).toEqual({ problem: 'Enter a weight.' });
  });

  it('keeps added load on a bodyweight exercise', () => {
    expect(readSetEdit('10', '8', 'metric', true)).toEqual({ weightKg: 10, reps: 8 });
  });

  it('points a bodyweight exercise at leaving the weight empty when it cannot be read', () => {
    expect(readSetEdit('abc', '8', 'metric', true)).toEqual({
      problem: 'Enter a weight, or leave it empty for bodyweight.',
    });
  });

  it('refuses a weight that cannot be read on a loaded lift', () => {
    expect(readSetEdit('abc', '8', 'metric', false)).toEqual({ problem: 'That weight looks wrong.' });
    expect(readSetEdit('-5', '8', 'metric', false)).toEqual({ problem: 'That weight looks wrong.' });
  });

  it('allows a weight of zero, which reads as no added load', () => {
    expect(readSetEdit('0', '8', 'metric', true)).toEqual({ weightKg: 0, reps: 8 });
  });

  it('refuses 1500 kg, and a weight that is over 1000 kg only once converted', () => {
    expect(readSetEdit('1500', '1', 'metric', false)).toEqual({ problem: 'That weight looks wrong.' });
    expect(readSetEdit('2300', '1', 'imperial', false)).toEqual({ problem: 'That weight looks wrong.' });
    expect(readSetEdit('2200', '1', 'imperial', false)).not.toHaveProperty('problem');
  });

  it('refuses reps that are not a whole number from 1 to 999', () => {
    const problem = { problem: 'Reps must be a whole number from 1 to 999.' };
    expect(readSetEdit('80', '0', 'metric', false)).toEqual(problem);
    expect(readSetEdit('80', '1000', 'metric', false)).toEqual(problem);
    expect(readSetEdit('80', '8.5', 'metric', false)).toEqual(problem);
    expect(readSetEdit('80', '', 'metric', false)).toEqual(problem);
    expect(readSetEdit('80', '-3', 'metric', false)).toEqual(problem);
    expect(readSetEdit('80', '999', 'metric', false)).toEqual({ weightKg: 80, reps: 999 });
  });

  it('reports the reps problem first', () => {
    expect(readSetEdit('', '0', 'metric', false)).toEqual({
      problem: 'Reps must be a whole number from 1 to 999.',
    });
  });
});
