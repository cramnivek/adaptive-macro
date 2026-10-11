import { describe, expect, it } from 'vitest';
import { loggingStrip } from '../loggingStrip';

const TODAY = '2026-10-15';

describe('loggingStrip', () => {
  it('covers the fourteen days before today, oldest first', () => {
    const strip = loggingStrip(TODAY, new Set(), new Set(), new Map());
    expect(strip).toHaveLength(14);
    expect(strip[0].date).toBe('2026-10-01');
    expect(strip[13].date).toBe('2026-10-14');
  });

  it('leaves today out, since its log is not finished', () => {
    const strip = loggingStrip(TODAY, new Set([TODAY]), new Set([TODAY]), new Map());
    expect(strip.some((day) => day.date === TODAY)).toBe(false);
  });

  it('tells counted, left-out and unlogged days apart', () => {
    const strip = loggingStrip(
      TODAY,
      new Set(['2026-10-13', '2026-10-14']),
      new Set(),
      new Map([['2026-10-13', false]]),
    );
    expect(strip[12]).toMatchObject({ date: '2026-10-13', food: 'left-out' });
    expect(strip[13]).toMatchObject({ date: '2026-10-14', food: 'counted' });
    expect(strip[11]).toMatchObject({ date: '2026-10-12', food: 'none' });
  });

  it('counts a light day confirmed as complete like any other', () => {
    const strip = loggingStrip(TODAY, new Set(['2026-10-14']), new Set(), new Map([['2026-10-14', true]]));
    expect(strip[13].food).toBe('counted');
  });

  it('ignores a "not fully logged" mark on a day with nothing logged', () => {
    const strip = loggingStrip(TODAY, new Set(), new Set(), new Map([['2026-10-14', false]]));
    expect(strip[13].food).toBe('none');
  });

  it('marks the days with a weigh-in', () => {
    const strip = loggingStrip(TODAY, new Set(), new Set(['2026-10-01', '2026-10-14']), new Map());
    expect(strip.filter((day) => day.weighed).map((day) => day.date)).toEqual(['2026-10-01', '2026-10-14']);
  });
});
