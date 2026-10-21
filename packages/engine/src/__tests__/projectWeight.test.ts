import { describe, expect, it } from 'vitest';
import { projectWeight } from '../trend.ts';

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;

describe('projectWeight', () => {
  it('carries a clear loss forward with a range that widens with time', () => {
    // 0.1 kg a day down, with a little scatter.
    const readings = Array.from({ length: 14 }, (_, i) => ({ date: day(i + 1), kg: 80 - 0.1 * i + (i % 2 ? 0.15 : -0.15) }));
    const week = projectWeight(readings, { kg: 78.7, sdKg: 0.2 }, 7)!;
    const month = projectWeight(readings, { kg: 78.7, sdKg: 0.2 }, 30)!;
    expect(week.kg).toBeCloseTo(78.0, 1);
    expect(month.kg).toBeCloseTo(75.8, 1);
    expect(month.highKg - month.lowKg).toBeGreaterThan(week.highKg - week.lowKg);
    expect(month.highKg).toBeLessThan(78.7);
  });

  it('gives a wide range while the rate is still noise', () => {
    const readings = Array.from({ length: 6 }, (_, i) => ({ date: day(i + 1), kg: 80 + (i % 2 ? 0.8 : -0.8) }));
    const month = projectWeight(readings, { kg: 80, sdKg: 0.5 }, 30)!;
    expect(month.highKg - month.lowKg).toBeGreaterThan(4);
  });

  it('says nothing with fewer than five weigh-ins', () => {
    expect(projectWeight([{ date: day(1), kg: 80 }, { date: day(2), kg: 79.8 }], { kg: 79.9, sdKg: 0.4 }, 7)).toBeNull();
  });
});
