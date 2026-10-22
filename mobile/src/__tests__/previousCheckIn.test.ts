import { describe, expect, it } from 'vitest';
import { adviceOf, previousCheckIn, type SavedCheckIn } from '../previousCheckIn';

const saved = (kind: SavedCheckIn['period']['kind'], from: string, to: string, headline: string): SavedCheckIn => ({
  period: { kind, from, to },
  headline,
  advice: null,
  applied: false,
});

describe('previousCheckIn', () => {
  const all = [
    saved('weekly', '2026-09-28', '2026-10-04', 'Two weeks ago'),
    saved('weekly', '2026-10-05', '2026-10-11', 'Last one'),
    saved('weekly', '2026-10-12', '2026-10-18', 'This one'),
    saved('monthly', '2026-09-28', '2026-10-25', 'A month'),
  ];

  it('is the newest check-in of the same kind that finished before the one in question', () => {
    expect(previousCheckIn(all, 'weekly', '2026-10-12')?.headline).toBe('Last one');
    expect(previousCheckIn(all, 'weekly', '2026-10-19')?.headline).toBe('This one');
  });

  it('is null before there was one', () => {
    expect(previousCheckIn(all, 'weekly', '2026-09-28')).toBeNull();
    expect(previousCheckIn(all, 'quarterly', '2026-12-28')).toBeNull();
  });
});

describe('adviceOf', () => {
  it('is the suggested adjustment in words, or null when it said to hold steady', () => {
    expect(adviceOf({ suggestedAdjustment: { hasAdjustment: true, title: 'Drop 150 kcal/day' } })).toBe('Drop 150 kcal/day');
    expect(adviceOf({ suggestedAdjustment: { hasAdjustment: false, title: 'Hold steady' } })).toBeNull();
    expect(adviceOf({})).toBeNull();
  });
});
