import { describe, expect, it } from 'vitest';
import { buildPeriodMap, periodWindow } from '../trendsOverview';

describe('recorded-days overview', () => {
  it('keeps missing days empty and counts each day once, including both boundaries', () => {
    const map = buildPeriodMap({
      from: '2026-10-18', to: '2026-10-24',
      foodDates: ['2026-10-17', '2026-10-18', '2026-10-18', '2026-10-24'],
      leftOutFoodDates: ['2026-10-20'], weightDates: ['2026-10-24'],
      trainingDates: ['2026-10-19', '2026-10-19'],
    });
    expect(map).toHaveLength(7);
    expect(map[0]).toMatchObject({ from: '2026-10-18', to: '2026-10-18', food: 1 });
    expect(map[1]).toMatchObject({ training: 1 });
    expect(map[2]).toMatchObject({ food: 0, leftOutFood: 1, weight: 0, training: 0 });
    expect(map[3]).toMatchObject({ food: 0, leftOutFood: 0, weight: 0, training: 0 });
    expect(map[6]).toMatchObject({ food: 1, weight: 1 });
  });

  it('groups long periods without losing or duplicating any days', () => {
    const map = buildPeriodMap({
      from: '2026-09-25', to: '2026-10-24', maxColumns: 5,
      foodDates: ['2026-09-25', '2026-10-01', '2026-10-24'],
      leftOutFoodDates: [], weightDates: [], trainingDates: [],
    });
    expect(map).toHaveLength(5);
    expect(map[0].from).toBe('2026-09-25');
    expect(map[4].to).toBe('2026-10-24');
    expect(map.reduce((sum, bucket) => sum + bucket.days, 0)).toBe(30);
    expect(map.reduce((sum, bucket) => sum + bucket.food, 0)).toBe(3);
  });
});

describe('historical period navigation', () => {
  it('pages by whole local-calendar windows and stops at the fetched year', () => {
    expect(periodWindow('2026-10-24', 7, 1)).toEqual({ from: '2026-10-11', to: '2026-10-17', offset: 1, maxOffset: 51 });
    expect(periodWindow('2026-10-24', 7, 100).from).toBe('2025-10-26');
    expect(periodWindow('2026-10-24', 365, 1)).toMatchObject({ from: '2025-10-25', to: '2026-10-24', offset: 0, maxOffset: 0 });
  });
  it('cannot navigate to a future window and handles year boundaries', () => {
    expect(periodWindow('2026-01-02', 7, -1)).toMatchObject({ from: '2025-12-27', to: '2026-01-02', offset: 0 });
  });
});
