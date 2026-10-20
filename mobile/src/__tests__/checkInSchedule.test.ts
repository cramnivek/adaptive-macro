import { addDays } from '@adaptive-macros/engine';
import { describe, expect, it } from 'vitest';
import {
  checkInLockedNote,
  checkInStatus,
  checkInStorageKey,
  earnedCheckIns,
  firstLoggedDate,
  qualifyingDays,
  requiredDays,
} from '../checkInSchedule';

// First log Thursday 1 Oct 2026, so the anchor week starts Monday 28 Sep.
const FIRST = '2026-10-01';
const TODAY = '2026-10-20'; // a Tuesday
const run = (from: string, n: number) => new Set(Array.from({ length: n }, (_, i) => addDays(from, i)));

describe('requiredDays', () => {
  it('asks for five of every seven days', () => {
    expect(requiredDays('weekly')).toBe(5);
    expect(requiredDays('monthly')).toBe(20);
    expect(requiredDays('quarterly')).toBe(65);
  });
});

describe('qualifyingDays', () => {
  it('needs a weigh-in and food, and skips days marked as not fully logged', () => {
    const days = qualifyingDays(
      [
        { date: '2026-10-12', weightKg: 75, intakeKcal: 1800 },
        { date: '2026-10-13', weightKg: 75 },
        { date: '2026-10-14', intakeKcal: 1800 },
        { date: '2026-10-15', weightKg: 75, intakeKcal: 0 },
        { date: '2026-10-16', weightKg: 75, intakeKcal: 900 },
      ],
      new Map([['2026-10-16', false]]),
    );
    expect([...days]).toEqual(['2026-10-12']);
  });
});

describe('checkInStatus', () => {
  it('covers last Monday-to-Sunday week, and earns it at five logged days', () => {
    const earned = checkInStatus('weekly', FIRST, TODAY, run('2026-10-12', 5))!;
    expect(earned.last).toEqual({
      period: { kind: 'weekly', from: '2026-10-12', to: '2026-10-18' },
      logged: 5,
      needed: 5,
      earned: true,
    });
    expect(earned.current.period).toEqual({ kind: 'weekly', from: '2026-10-19', to: '2026-10-25' });
    expect(earned.current.daysLeft).toBe(6);

    expect(checkInStatus('weekly', FIRST, TODAY, run('2026-10-12', 4))!.last!.earned).toBe(false);
  });

  it('does not change with the day or with more logging inside the same week', () => {
    const before = checkInStatus('weekly', FIRST, TODAY, run('2026-10-12', 5))!;
    const later = checkInStatus('weekly', FIRST, '2026-10-24', run('2026-10-12', 12))!;
    expect(later.last!.period).toEqual(before.last!.period);
    expect(checkInStorageKey(later.last!.period)).toBe(checkInStorageKey(before.last!.period));
  });

  it('has no finished month yet three weeks in, and counts progress toward it', () => {
    const status = checkInStatus('monthly', FIRST, TODAY, run('2026-10-01', 18))!;
    expect(status.last).toBeNull();
    expect(status.current).toEqual({
      period: { kind: 'monthly', from: '2026-09-28', to: '2026-10-25' },
      logged: 18,
      needed: 20,
      daysLeft: 6,
    });
  });

  it('finishes the first month on the fourth Sunday, in step with the weeks', () => {
    const status = checkInStatus('monthly', FIRST, '2026-10-26', run('2026-10-01', 22))!;
    expect(status.last!.period).toEqual({ kind: 'monthly', from: '2026-09-28', to: '2026-10-25' });
    expect(status.last!.earned).toBe(true);
    expect(status.current.period.from).toBe('2026-10-26');
  });

  it('runs a quarter for thirteen weeks', () => {
    const status = checkInStatus('quarterly', FIRST, TODAY, new Set())!;
    expect(status.current.period).toEqual({ kind: 'quarterly', from: '2026-09-28', to: '2026-12-27' });
    expect(status.current.needed).toBe(65);
  });

  it('is null until something is logged', () => {
    expect(checkInStatus('weekly', null, TODAY, new Set())).toBeNull();
  });
});

describe('checkInLockedNote', () => {
  it('says nothing once the last period earned its check-in', () => {
    expect(checkInLockedNote(checkInStatus('weekly', FIRST, TODAY, run('2026-10-12', 5))!)).toBeNull();
  });

  it('names a thin week and what this one still needs', () => {
    const days = new Set([...run('2026-10-12', 3), ...run('2026-10-19', 2)]);
    expect(checkInLockedNote(checkInStatus('weekly', FIRST, TODAY, days)!)).toBe(
      'The week of 12 Oct to 18 Oct had 3 of 5 days with a weigh-in and food logged, too few for a check-in. This week: 2 of 5 so far, with 6 days to go.',
    );
  });

  it('explains the first month before it has finished', () => {
    expect(checkInLockedNote(checkInStatus('monthly', FIRST, TODAY, run('2026-10-01', 18))!)).toBe(
      'Your first month runs to 25 Oct. Its check-in unlocks once 20 of its days have a weigh-in and food logged: 18 of 20 so far, with 6 days to go.',
    );
  });
});

describe('firstLoggedDate and earnedCheckIns', () => {
  it('starts from the earliest weigh-in or food, ignoring empty days', () => {
    expect(
      firstLoggedDate([
        { date: '2026-09-30' },
        { date: '2026-10-02', intakeKcal: 1800 },
        { date: '2026-10-01', weightKg: 76 },
      ]),
    ).toBe('2026-10-01');
    expect(firstLoggedDate([])).toBeNull();
  });

  it('lists what was earned, longest first', () => {
    // Monday 26 Oct: the first month and the week before both just finished.
    const earned = earnedCheckIns(FIRST, '2026-10-26', run('2026-10-01', 25));
    expect(earned.map((p) => p.kind)).toEqual(['monthly', 'weekly']);
    expect(earnedCheckIns(FIRST, TODAY, run('2026-10-12', 3))).toEqual([]);
  });
});
