import { describe, expect, it } from 'vitest';
import { sleepAdvice } from '../sleepAdvice';
import type { SleepSummary } from '../sleep';
import { normalizeSleep, summarizeSleep } from '../sleep';

const night = (sleepMinutes: number | null, observedMinutes: number | null = 540, date = '2026-10-23'): SleepSummary => ({
  date: date as SleepSummary['date'], start: 0, end: 540 * 60000,
  sessionMinutes: 540, sleepMinutes, observedMinutes, fullyObserved: observedMinutes === 540, sources: ['Garmin'],
});

describe('actionable sleep guidance', () => {
  it('does not round a small recording gap into complete coverage', () => {
    const selected = summarizeSleep(normalizeSleep([{
      startTime: '2026-10-22T22:00:00+08:00', endTime: '2026-10-23T06:00:00+08:00',
      stages: [
        { startTime: '2026-10-22T22:00:00+08:00', endTime: '2026-10-23T04:00:00+08:00', stage: 2 },
        { startTime: '2026-10-23T04:00:00+08:00', endTime: '2026-10-23T05:59:40+08:00', stage: 1 },
      ],
    }]))[0];
    expect(sleepAdvice(selected, [], 30).state).toBe('unknown');
  });
  it('uses recorded sleep rather than time in bed to identify a short recording', () => {
    expect(sleepAdvice(night(360), [], 30).state).toBe('short');
    expect(sleepAdvice(night(null), [], 30).state).toBe('unknown');
  });
  it('uses the adult and teenage minimums without rating sleep quality', () => {
    expect(sleepAdvice(night(420), [], 30).state).toBe('enough');
    expect(sleepAdvice(night(420), [], 17).state).toBe('short');
    expect(sleepAdvice(night(480), [], 17).state).toBe('enough');
    expect(sleepAdvice(night(419), [], 65).state).toBe('short');
    expect(sleepAdvice(night(420), [], NaN).state).toBe('unknown');
    expect(sleepAdvice(night(420), [], 10).state).toBe('unknown');
  });
  it('does not turn gaps or legacy coverage into a sleep deficit', () => {
    expect(sleepAdvice(night(360, 400), [], 30).state).toBe('unknown');
    expect(sleepAdvice(night(360, null), [], 30).state).toBe('unknown');
    expect(sleepAdvice(night(480, null), [], 30).state).toBe('enough');
  });
  it('uses only covered recent dates and does not turn missing nights into zero', () => {
    const selected = night(480);
    const recent = [night(360, 540, '2026-10-21'), night(390, 540, '2026-10-22'), selected,
      night(0, null, '2026-10-20'), night(200, 540, '2026-10-01'), night(100, 540, '2026-10-24')];
    expect(sleepAdvice(selected, recent, 30).recent).toEqual({ nights: 3, averageMinutes: 410, shortNights: 2 });
    expect(sleepAdvice(selected, recent, 30)).toMatchObject({ state: 'enough', action: expect.stringContaining('more time for sleep') });
    expect(sleepAdvice(selected, recent.slice(0, 2), 30).recent).toBeNull();
  });
  it('does not assess a missing or invalid recording', () => {
    expect(sleepAdvice(undefined, [], 30).state).toBe('missing');
    expect(sleepAdvice(night(-1), [], 30).state).toBe('unknown');
    expect(sleepAdvice(night(600), [], 30).state).toBe('unknown');
  });
});
