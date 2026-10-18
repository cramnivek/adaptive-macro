import { describe, expect, it } from 'vitest';
import { draftsToAdd, previousSetFor, repsPrefill, resumeOrder, targetLabel } from '../routinePlan';

describe('draftsToAdd', () => {
  it('fills an untouched exercise to its target', () => {
    expect(draftsToAdd(4, 0)).toBe(4);
  });

  it('tops up an exercise half done when the session is reopened', () => {
    expect(draftsToAdd(4, 2)).toBe(2);
  });

  it('adds nothing once the target is met or passed', () => {
    expect(draftsToAdd(3, 3)).toBe(0);
    expect(draftsToAdd(3, 5)).toBe(0);
  });

  it('excludes warm-up sets from the working set target', () => {
    // 3 sets targeted, 3 total rows logged but 2 are warm-ups => 2 more working sets needed
    expect(draftsToAdd(3, 3, 2)).toBe(2);
    // 3 sets targeted, 1 warm-up and 3 working sets => target satisfied
    expect(draftsToAdd(3, 4, 1)).toBe(0);
    // 4 sets targeted, 2 warm-up rows logged => 4 working sets still needed
    expect(draftsToAdd(4, 2, 2)).toBe(4);
  });
});

describe('repsPrefill', () => {
  it('takes last time’s reps first, as a new row already does', () => {
    expect(repsPrefill(10, '6-8')).toBe('10');
    expect(repsPrefill(5, null)).toBe('5');
  });

  it('uses a single-number target when there is no history', () => {
    expect(repsPrefill(undefined, '8')).toBe('8');
  });

  it('leaves the box empty for a target that is not one number', () => {
    expect(repsPrefill(undefined, '8-10')).toBe('');
    expect(repsPrefill(undefined, 'AMRAP')).toBe('');
    expect(repsPrefill(undefined, '10 each leg')).toBe('');
    expect(repsPrefill(undefined, null)).toBe('');
  });
});

describe('resumeOrder', () => {
  it('keeps the routine’s order, including exercises not started yet', () => {
    expect(resumeOrder(['Squat', 'Bench Press', 'Row'], ['Bench Press'])).toEqual(['Squat', 'Bench Press', 'Row']);
  });

  it('puts exercises added during the session after the routine’s', () => {
    expect(resumeOrder(['Squat', 'Row'], ['Squat', 'Dips', 'Curl'])).toEqual(['Squat', 'Row', 'Dips', 'Curl']);
  });

  it('is the logged order alone for a session with no routine', () => {
    expect(resumeOrder([], ['Dips', 'Curl'])).toEqual(['Dips', 'Curl']);
  });
});

describe('targetLabel', () => {
  it('states sets and reps as the programme wrote them', () => {
    expect(targetLabel(4, '6-8')).toBe('TARGET 4 × 6-8');
    expect(targetLabel(1, 'amrap')).toBe('TARGET 1 × AMRAP');
  });

  it('states sets alone when the routine gave no rep target', () => {
    expect(targetLabel(3, null)).toBe('TARGET 3 SETS');
  });
});

describe('previousSetFor', () => {
  const previousWorking = [
    { weightKg: 89.4, reps: 6, setType: 'normal' },
    { weightKg: 89.4, reps: 6, setType: 'normal' },
    { weightKg: 89.4, reps: 5, setType: 'normal' },
  ];

  it('matches working sets by working-set index when warmups are prepended', () => {
    const rows = [
      { setType: 'warmup' },
      { setType: 'warmup' },
      { setType: 'warmup' },
      { setType: 'normal' },
      { setType: 'normal' },
      { setType: 'normal' },
      { setType: 'normal' },
    ];

    // Warmups do not steal working set numbers:
    expect(previousSetFor(previousWorking, rows, 0, 'warmup')).toBeUndefined();
    expect(previousSetFor(previousWorking, rows, 1, 'warmup')).toBeUndefined();
    expect(previousSetFor(previousWorking, rows, 2, 'warmup')).toBeUndefined();

    // Working sets match against working sets:
    expect(previousSetFor(previousWorking, rows, 3, 'normal')).toEqual(previousWorking[0]);
    expect(previousSetFor(previousWorking, rows, 4, 'normal')).toEqual(previousWorking[1]);
    expect(previousSetFor(previousWorking, rows, 5, 'normal')).toEqual(previousWorking[2]);
    // Extra working set beyond previous session count falls back to last working set:
    expect(previousSetFor(previousWorking, rows, 6, 'normal')).toEqual(previousWorking[2]);
  });

  it('matches warmups against previous warmups if previously logged', () => {
    const previousMixed = [
      { weightKg: 20, reps: 10, setType: 'warmup' },
      { weightKg: 40, reps: 5, setType: 'warmup' },
      { weightKg: 90, reps: 6, setType: 'normal' },
      { weightKg: 90, reps: 6, setType: 'normal' },
    ];
    const rows = [
      { setType: 'warmup' },
      { setType: 'warmup' },
      { setType: 'normal' },
      { setType: 'normal' },
    ];

    expect(previousSetFor(previousMixed, rows, 0, 'warmup')).toEqual(previousMixed[0]);
    expect(previousSetFor(previousMixed, rows, 1, 'warmup')).toEqual(previousMixed[1]);
    expect(previousSetFor(previousMixed, rows, 2, 'normal')).toEqual(previousMixed[2]);
    expect(previousSetFor(previousMixed, rows, 3, 'normal')).toEqual(previousMixed[3]);
  });

  it('returns undefined if previous sets are empty', () => {
    expect(previousSetFor([], [{ setType: 'normal' }], 0, 'normal')).toBeUndefined();
    expect(previousSetFor(undefined, [{ setType: 'normal' }], 0, 'normal')).toBeUndefined();
  });
});
