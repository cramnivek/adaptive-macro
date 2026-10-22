import { addDays } from '@adaptive-macros/engine';
import { describe, expect, it } from 'vitest';
import {
  checkInLockedNote,
  checkInStatus,
  checkInStorageKey,
  earnedCheckIns,
  firstLoggedDate,
  loggedDays,
  requiredDays,
  requiredWeighIns,
  type LoggedDays,
} from '../checkInSchedule';

// First log Thursday 1 Oct 2026, so the anchor week starts Monday 28 Sep.
const FIRST = '2026-10-01';
const TODAY = '2026-10-20'; // a Tuesday
const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
/** Food and a weigh-in on the same days, as most tests want. */
const both = (dates: string[]): LoggedDays => ({ food: new Set(dates), weighIns: new Set(dates) });

describe('requiredDays and requiredWeighIns', () => {
  it('asks for food on five of every seven days, and three weigh-ins a week', () => {
    expect(requiredDays('weekly')).toBe(5);
    expect(requiredDays('monthly')).toBe(20);
    expect(requiredDays('quarterly')).toBe(65);
    expect(requiredWeighIns('weekly')).toBe(3);
    expect(requiredWeighIns('monthly')).toBe(12);
    expect(requiredWeighIns('quarterly')).toBe(39);
  });
});

describe('loggedDays', () => {
  it('counts food and weigh-ins apart, and skips food on days marked as not fully logged', () => {
    const logged = loggedDays(
      [
        { date: '2026-10-12', weightKg: 75, intakeKcal: 1800 },
        { date: '2026-10-13', weightKg: 75 },
        { date: '2026-10-14', intakeKcal: 1800 },
        { date: '2026-10-15', weightKg: 75, intakeKcal: 0 },
        { date: '2026-10-16', weightKg: 75, intakeKcal: 900 },
      ],
      new Map([['2026-10-16', false]]),
    );
    expect([...logged.food]).toEqual(['2026-10-12', '2026-10-14']);
    expect([...logged.weighIns]).toEqual(['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16']);
  });
});

describe('checkInStatus', () => {
  it('covers last Monday-to-Sunday week, and earns it at five food days and three weigh-ins', () => {
    const earned = checkInStatus('weekly', FIRST, TODAY, both(run('2026-10-12', 5)))!;
    expect(earned.last).toEqual({
      period: { kind: 'weekly', from: '2026-10-12', to: '2026-10-18' },
      food: 5,
      foodNeeded: 5,
      weighIns: 5,
      weighInsNeeded: 3,
      earned: true,
    });
    expect(earned.current.period).toEqual({ kind: 'weekly', from: '2026-10-19', to: '2026-10-25' });
    expect(earned.current.daysLeftAfterToday).toBe(5);

    expect(checkInStatus('weekly', FIRST, TODAY, both(run('2026-10-12', 4)))!.last!.earned).toBe(false);
  });

  it('earns a week with food every day and only some weigh-ins, as the estimate needs', () => {
    // 12 to 18 Oct as it was logged: food on six days, four weigh-ins, three
    // days with both. The old rule wanted both on five days and refused it.
    const logged: LoggedDays = {
      food: new Set(run('2026-10-13', 6)),
      weighIns: new Set(['2026-10-12', '2026-10-14', '2026-10-15', '2026-10-16']),
    };
    expect(checkInStatus('weekly', FIRST, TODAY, logged)!.last!.earned).toBe(true);
    const twoWeighIns = { ...logged, weighIns: new Set(['2026-10-12', '2026-10-14']) };
    expect(checkInStatus('weekly', FIRST, TODAY, twoWeighIns)!.last!.earned).toBe(false);
  });

  it('ends the week on the chosen day', () => {
    // A Friday check-in: Saturday 10 Oct to Friday 16 Oct is the finished week.
    const status = checkInStatus('weekly', FIRST, TODAY, both(run('2026-10-10', 7)), 5)!;
    expect(status.last!.period).toEqual({ kind: 'weekly', from: '2026-10-10', to: '2026-10-16' });
    expect(status.last!.earned).toBe(true);
    expect(status.current.period.to).toBe('2026-10-23');
  });

  it('does not change with the day or with more logging inside the same week', () => {
    const before = checkInStatus('weekly', FIRST, TODAY, both(run('2026-10-12', 5)))!;
    const later = checkInStatus('weekly', FIRST, '2026-10-24', both(run('2026-10-12', 12)))!;
    expect(later.last!.period).toEqual(before.last!.period);
    expect(checkInStorageKey(later.last!.period)).toBe(checkInStorageKey(before.last!.period));
  });

  it('has no finished month yet three weeks in, and counts progress toward it', () => {
    const status = checkInStatus('monthly', FIRST, TODAY, both(run('2026-10-01', 18)))!;
    expect(status.last).toBeNull();
    expect(status.current).toEqual({
      period: { kind: 'monthly', from: '2026-09-28', to: '2026-10-25' },
      food: 18,
      foodNeeded: 20,
      weighIns: 18,
      weighInsNeeded: 12,
      daysLeftAfterToday: 5,
    });
  });

  it('finishes the first month on the fourth Sunday, in step with the weeks', () => {
    const status = checkInStatus('monthly', FIRST, '2026-10-26', both(run('2026-10-01', 22)))!;
    expect(status.last!.period).toEqual({ kind: 'monthly', from: '2026-09-28', to: '2026-10-25' });
    expect(status.last!.earned).toBe(true);
    expect(status.current.period.from).toBe('2026-10-26');
  });

  it('runs a quarter for thirteen weeks', () => {
    const status = checkInStatus('quarterly', FIRST, TODAY, both([]))!;
    expect(status.current.period).toEqual({ kind: 'quarterly', from: '2026-09-28', to: '2026-12-27' });
    expect(status.current.foodNeeded).toBe(65);
  });

  it('is null until something is logged', () => {
    expect(checkInStatus('weekly', null, TODAY, both([]))).toBeNull();
  });
});

describe('checkInLockedNote', () => {
  it('says nothing once the last period earned its check-in', () => {
    expect(checkInLockedNote(checkInStatus('weekly', FIRST, TODAY, both(run('2026-10-12', 5)))!)).toBeNull();
  });

  it('names what a thin week lacked, and what this one has, without counting today twice', () => {
    const logged: LoggedDays = {
      food: new Set([...run('2026-10-12', 6), ...run('2026-10-19', 2)]),
      weighIns: new Set(['2026-10-12', '2026-10-14', '2026-10-19']),
    };
    expect(checkInLockedNote(checkInStatus('weekly', FIRST, TODAY, logged)!)).toBe(
      'The week of 12 Oct to 18 Oct had food logged on 6 days but 2 of the 3 weigh-ins needed, too few for a check-in. ' +
        'This week so far: food on 2 of the 5 days needed and 1 of the 3 weigh-ins, with 5 days left after today.',
    );
  });

  it('says when the week ends today', () => {
    const note = checkInLockedNote(checkInStatus('weekly', FIRST, '2026-10-25', both(run('2026-10-12', 2)))!);
    expect(note).toContain('and it ends today.');
  });

  it('explains the first month before it has finished', () => {
    expect(checkInLockedNote(checkInStatus('monthly', FIRST, TODAY, both(run('2026-10-01', 18)))!)).toBe(
      'Your first month runs to 25 Oct. Its check-in unlocks with food logged on 20 of its days and 12 weigh-ins. ' +
        'So far: food on 18 of the 20 days needed and 18 weigh-ins, with 5 days left after today.',
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
    const earned = earnedCheckIns(FIRST, '2026-10-26', both(run('2026-10-01', 25)));
    expect(earned.map((p) => p.kind)).toEqual(['monthly', 'weekly']);
    expect(earnedCheckIns(FIRST, TODAY, both(run('2026-10-12', 3)))).toEqual([]);
  });
});
