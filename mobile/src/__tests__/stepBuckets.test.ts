import { describe, expect, it } from 'vitest';
import { stepBuckets } from '../stepBuckets';

const byDate = new Map<string, number>([
  ['2026-10-21', 2893],
  ['2026-10-20', 5700],
  ['2026-10-15', 6000],
  ['2026-09-30', 9000],
  ['2026-09-01', 7000],
]);

describe('stepBuckets', () => {
  it('gives a week as seven days, today last', () => {
    const week = stepBuckets('2026-10-21', byDate, 'week');
    expect(week.map((b) => b.label)).toEqual(['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Today']);
    expect(week.at(-1)).toMatchObject({ date: '2026-10-21', steps: 2893 });
    expect(week[0]).toMatchObject({ date: '2026-10-15', steps: 6000 });
    // A day with nothing counted is not a day of zero steps.
    expect(week[1].steps).toBeUndefined();
  });

  it('gives a month as thirty days, labelled sparingly so the labels fit', () => {
    const month = stepBuckets('2026-10-21', byDate, 'month');
    expect(month).toHaveLength(30);
    expect(month[0].date).toBe('2026-09-22');
    expect(month.at(-1)?.label).toBe('Today');
    expect(month.filter((b) => b.label !== '').length).toBeLessThanOrEqual(6);
  });

  it('gives a year as twelve months, each the average of the days with a count', () => {
    const year = stepBuckets('2026-10-21', byDate, 'year');
    expect(year).toHaveLength(12);
    expect(year.map((b) => b.label).slice(-3)).toEqual(['Aug', 'Sep', 'Oct']);
    expect(year.at(-1)).toMatchObject({ steps: Math.round((2893 + 5700 + 6000) / 3), days: 3 });
    expect(year.at(-2)).toMatchObject({ steps: 8000, days: 2 });
    // A month with nothing logged is not a month of zero steps.
    expect(year[0].steps).toBeUndefined();
    expect(year[0].date).toBeUndefined();
  });
});
