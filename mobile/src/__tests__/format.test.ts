import { describe, expect, it } from 'vitest';
import { formatDayMonth } from '../format';

describe('formatDayMonth', () => {
  it('gives the day and the month, and nothing else', () => {
    expect(formatDayMonth('2026-10-02')).toBe('2 Oct');
  });

  it('does not pad the day, which would waste axis width', () => {
    expect(formatDayMonth('2026-01-05')).toBe('5 Jan');
  });

  it('tells two dates in different months apart', () => {
    // The whole point: ninety days of axis needs two labels that differ.
    expect(formatDayMonth('2026-07-14')).not.toBe(formatDayMonth('2026-10-12'));
  });

  it('reads the date as UTC, so a local timezone cannot shift it a day', () => {
    expect(formatDayMonth('2026-03-01')).toBe('1 Mar');
    expect(formatDayMonth('2026-12-31')).toBe('31 Dec');
  });
});
