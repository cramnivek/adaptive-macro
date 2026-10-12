import { describe, expect, it } from 'vitest';
import { monthGrid, monthTitle, shiftMonth } from '../calendarMonth';

describe('monthGrid', () => {
  it('starts October 2026, a Thursday, on the Monday before it', () => {
    const first = monthGrid(2026, 10)[0]!;
    expect(first[0]).toEqual({ date: '2026-09-28', inMonth: false });
    expect(first.filter((day) => !day.inMonth)).toHaveLength(3);
    expect(first[3]).toEqual({ date: '2026-10-01', inMonth: true });
  });

  it('has no leading padding when the month starts on a Monday', () => {
    // 1 June 2026 is a Monday.
    const first = monthGrid(2026, 6)[0]!;
    expect(first[0]).toEqual({ date: '2026-06-01', inMonth: true });
    expect(first.every((day) => day.inMonth)).toBe(true);
  });

  it('counts 29 days in February of a leap year', () => {
    const days = monthGrid(2028, 2).flat().filter((day) => day.inMonth);
    expect(days).toHaveLength(29);
    expect(days[28]!.date).toBe('2028-02-29');
  });

  it('fills every row with seven days, in five or six rows', () => {
    for (let month = 1; month <= 12; month += 1) {
      const grid = monthGrid(2026, month);
      expect(grid.length === 5 || grid.length === 6).toBe(true);
      for (const row of grid) expect(row).toHaveLength(7);
    }
  });

  it('pads the end with the next month so the last row is full', () => {
    const last = monthGrid(2026, 10).at(-1)!;
    expect(last[6]).toEqual({ date: '2026-11-01', inMonth: false });
  });
});

describe('shiftMonth', () => {
  it('moves within a year', () => {
    expect(shiftMonth(2026, 10, -1)).toEqual({ year: 2026, month: 9 });
    expect(shiftMonth(2026, 10, 1)).toEqual({ year: 2026, month: 11 });
  });

  it('wraps December to January', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('wraps January to December', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('monthTitle', () => {
  it('names the month and year', () => {
    expect(monthTitle(2026, 10)).toBe('October 2026');
    expect(monthTitle(2028, 2)).toBe('February 2028');
  });
});
