import type { LogEntry, Meal } from '@adaptive-macros/engine';
import { describe, expect, it } from 'vitest';
import { defaultMealForHour, usualFoods } from '../usualFoods';

const entry = (
  id: string,
  date: string,
  foodId: string,
  foodName: string,
  meal: Meal = 'breakfast',
  grams = 100,
): LogEntry => ({
  id,
  date,
  foodId,
  foodName,
  grams,
  meal,
  nutrients: { kcal: grams * 2, proteinG: 10, carbsG: 20, fatG: 5 },
});

describe('usual foods', () => {
  it.each([
    [0, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [15, 'lunch'],
    [16, 'dinner'],
    [20, 'dinner'],
    [21, 'snack'],
    [23, 'snack'],
  ] as const)('chooses %s-hour meal as %s', (hour, meal) => {
    expect(defaultMealForHour(hour)).toBe(meal);
  });

  it('ranks distinct logged days before recency', () => {
    const suggestions = usualFoods(
      [
        entry('once-new', '2026-10-22', 'once', 'One-off'),
        entry('often-old-1', '2026-10-02', 'often', 'Often'),
        entry('often-old-2', '2026-10-10', 'often', 'Often'),
        entry('often-new', '2026-10-21', 'often', 'Often'),
      ],
      '2026-10-23',
      'breakfast',
    );

    expect(suggestions.map(({ entry: item, days }) => [item.foodId, days])).toEqual([
      ['often', 3],
      ['once', 1],
    ]);
    expect(suggestions[0].entry.grams).toBe(100);
    expect(suggestions[0].latestDate).toBe('2026-10-21');
  });

  it('uses the latest portion and latest date when a food is logged more than once per day', () => {
    const suggestions = usualFoods(
      [
        entry('first', '2026-10-20', 'oats', 'Oats', 'breakfast', 80),
        entry('second', '2026-10-20', 'oats', 'Oats', 'breakfast', 120),
        entry('third', '2026-10-21', 'oats', 'Oats', 'breakfast', 150),
      ],
      '2026-10-23',
      'breakfast',
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ days: 2, latestDate: '2026-10-21' });
    expect(suggestions[0].entry.grams).toBe(150);
  });

  it('uses recency and a stable name tie break when frequencies match', () => {
    const suggestions = usualFoods(
      [
        entry('b', '2026-10-20', 'b', 'Yogurt'),
        entry('a', '2026-10-21', 'a', 'Zucchini'),
        entry('c', '2026-10-21', 'c', 'Apple'),
      ],
      '2026-10-23',
      'breakfast',
    );

    expect(suggestions.map(({ entry: item }) => item.foodId)).toEqual(['c', 'a', 'b']);
  });

  it('only uses history before the destination date and within 28 days', () => {
    const suggestions = usualFoods(
      [
        entry('current', '2026-10-23', 'current', 'Current'),
        entry('future', '2026-10-24', 'future', 'Future'),
        entry('old', '2026-09-24', 'old', 'Too old'),
        entry('edge', '2026-09-25', 'edge', 'At edge'),
      ],
      '2026-10-23',
      'breakfast',
    );

    expect(suggestions.map(({ entry: item }) => item.foodId)).toEqual(['edge']);
  });

  it('keeps meal history separate and excludes foods already in the destination meal', () => {
    const suggestions = usualFoods(
      [
        entry('breakfast', '2026-10-22', 'same', 'Same food', 'breakfast'),
        entry('lunch', '2026-10-22', 'lunch-only', 'Lunch food', 'lunch'),
      ],
      '2026-10-23',
      'breakfast',
      [entry('today', '2026-10-23', 'same', 'Same food', 'breakfast')],
    );

    expect(suggestions).toEqual([]);
  });

  it('does not treat entries from the previous selected day as destination foods', () => {
    const suggestions = usualFoods(
      [entry('history', '2026-10-22', 'same', 'Same food')],
      '2026-10-23',
      'breakfast',
      [entry('stale-destination', '2026-10-22', 'same', 'Same food')],
    );

    expect(suggestions).toHaveLength(1);
  });

  it('collapses estimated foods with changing ids when their normalized names match', () => {
    const suggestions = usualFoods(
      [
        entry('ai:1', '2026-10-20', 'ai:1', ' Greek   Yogurt '),
        entry('ai:2', '2026-10-21', 'ai:2', 'greek yogurt', 'breakfast', 170),
      ],
      '2026-10-23',
      'breakfast',
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ days: 2, entry: { id: 'ai:2', grams: 170 } });
  });

  it('returns no suggestions without eligible history', () => {
    expect(usualFoods([], '2026-10-23', 'snack')).toEqual([]);
  });

  it('keeps the shortcut list to three foods without changing the source history', () => {
    const history = ['Apple', 'Banana', 'Carrots', 'Dates'].map((name, i) =>
      entry(String(i), '2026-10-22', name, name));
    const original = structuredClone(history);
    expect(usualFoods(history, '2026-10-23', 'breakfast').map(({ entry: food }) => food.foodName))
      .toEqual(['Apple', 'Banana', 'Carrots']);
    expect(history).toEqual(original);
  });
});
