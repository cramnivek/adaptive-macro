import { afterEach, describe, expect, it, vi } from 'vitest';
import { followLocalDay, observeLocalDay } from '../localDay';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('local calendar day tracking', () => {
  it('advances at local midnight without requiring another render', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 23, 23, 59, 59, 990));
    const change = vi.fn();
    const clock = observeLocalDay('2026-10-23', change);
    await vi.advanceTimersByTimeAsync(10);
    expect(change.mock.calls).toEqual([['2026-10-23', '2026-10-24']]);
    clock.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('catches up immediately on resume after several suspended days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 23, 12));
    const change = vi.fn();
    const clock = observeLocalDay('2026-10-23', change);
    vi.setSystemTime(new Date(2026, 9, 26, 9));
    clock.check();
    expect(change.mock.calls).toEqual([['2026-10-23', '2026-10-26']]);
    expect(vi.getTimerCount()).toBe(1);
    clock.stop();
  });

  it('uses local calendar fields even when the UTC date is different', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T20:00:00Z'));
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(9);
    vi.spyOn(Date.prototype, 'getDate').mockReturnValue(24);
    const change = vi.fn();
    const clock = observeLocalDay('2026-10-23', change);
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-23');
    expect(change.mock.calls).toEqual([['2026-10-23', '2026-10-24']]);
    clock.stop();
  });

  it('notices a local day moving backward after a timezone or clock change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 24, 12));
    const change = vi.fn();
    const clock = observeLocalDay('2026-10-24', change);
    vi.setSystemTime(new Date(2026, 9, 23, 12));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(change.mock.calls).toEqual([['2026-10-24', '2026-10-23']]);
    clock.stop();
  });

  it('handles a local year boundary and does not repeat the same change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
    const change = vi.fn();
    const clock = observeLocalDay('2026-12-31', change);
    await vi.advanceTimersByTimeAsync(61_000);
    clock.check();
    expect(change.mock.calls).toEqual([['2026-12-31', '2027-01-01']]);
    clock.stop();
  });

  it('never emits or schedules more work after cleanup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 23, 12));
    const change = vi.fn();
    const clock = observeLocalDay('2026-10-23', change);
    clock.stop();
    vi.setSystemTime(new Date(2026, 9, 24, 12));
    clock.check();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(change).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('following today while preserving intentional diary navigation', () => {
  it.each([
    ['2026-10-23', '2026-10-23', '2026-10-24', '2026-10-24'],
    ['2026-10-21', '2026-10-23', '2026-10-24', '2026-10-21'],
    ['2026-10-24', '2026-10-24', '2026-10-23', '2026-10-23'],
    ['2026-10-21', '2026-10-24', '2026-10-23', '2026-10-21'],
  ])('%s with local day %s → %s selects %s', (selected, previous, current, expected) => {
    expect(followLocalDay(selected, previous, current)).toBe(expected);
  });
});
