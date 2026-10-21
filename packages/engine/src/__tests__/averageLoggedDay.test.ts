import { describe, expect, it } from 'vitest';
import { averageLoggedDay } from '../foods.ts';

const n = (kcal: number, vitaminCMg: number) => ({ kcal, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, micros: { vitaminCMg } });

describe('averageLoggedDay', () => {
  it('divides by the days that have anything logged, not by the calendar', () => {
    const avg = averageLoggedDay([
      { date: '2026-10-01', nutrients: n(1000, 30) },
      { date: '2026-10-01', nutrients: n(1000, 30) },
      { date: '2026-10-03', nutrients: n(2000, 90) },
    ]);
    expect(avg.days).toBe(2);
    expect(avg.nutrients.kcal).toBe(2000);
    expect(avg.nutrients.micros?.vitaminCMg).toBe(75);
  });

  it('is empty with nothing logged', () => {
    expect(averageLoggedDay([])).toEqual({ nutrients: expect.objectContaining({ kcal: 0 }), days: 0 });
  });
});
