import { describe, expect, it } from 'vitest';
import { BUILTIN_FOODS, getPopularBuiltinFoods, searchBuiltinFoods } from '../builtinFoods';

describe('builtinFoods catalogue', () => {
  it('contains staple foods across major macro categories', () => {
    expect(BUILTIN_FOODS.length).toBeGreaterThanOrEqual(50);

    const categories = new Set(BUILTIN_FOODS.map((f) => f.category));
    expect(categories.has('protein')).toBe(true);
    expect(categories.has('carbs')).toBe(true);
    expect(categories.has('produce')).toBe(true);
    expect(categories.has('fats')).toBe(true);
    expect(categories.has('dairy')).toBe(true);
  });

  it('every food has valid macros and at least one household portion besides 100g', () => {
    for (const food of BUILTIN_FOODS) {
      expect(food.source).toBe('builtin');
      expect(food.per100g.kcal).toBeGreaterThan(0);
      expect(food.portions.length).toBeGreaterThanOrEqual(2);

      const hasHouseholdPortion = food.portions.some((p) => p.grams !== 100 && p.label !== '100 g');
      expect(hasHouseholdPortion).toBe(true);
    }
  });

  it('searchBuiltinFoods finds foods by keyword and category', () => {
    const eggs = searchBuiltinFoods('egg');
    expect(eggs.some((f) => f.name.toLowerCase().includes('egg'))).toBe(true);

    const chicken = searchBuiltinFoods('chicken', 'protein');
    expect(chicken.length).toBeGreaterThan(0);
    expect(chicken.every((f) => f.category === 'protein')).toBe(true);

    const filtered = searchBuiltinFoods('rice', 'carbs');
    expect(filtered.some((f) => f.name.toLowerCase().includes('rice'))).toBe(true);
  });

  it('searchBuiltinFoods falls back gracefully to typo tolerance (egf, chiken, avocdo)', () => {
    const eggs = searchBuiltinFoods('egf');
    expect(eggs.length).toBeGreaterThan(0);
    expect(eggs.some((f) => f.name.toLowerCase().includes('egg'))).toBe(true);

    const chicken = searchBuiltinFoods('chiken');
    expect(chicken.length).toBeGreaterThan(0);
    expect(chicken.some((f) => f.name.toLowerCase().includes('chicken'))).toBe(true);

    const avocado = searchBuiltinFoods('avocdo');
    expect(avocado.length).toBeGreaterThan(0);
    expect(avocado.some((f) => f.name.toLowerCase().includes('avocado'))).toBe(true);
  });

  it('getPopularBuiltinFoods returns staples filtered by category', () => {
    const allStaples = getPopularBuiltinFoods('all', 10);
    expect(allStaples).toHaveLength(10);

    const proteins = getPopularBuiltinFoods('protein', 5);
    expect(proteins).toHaveLength(5);
    expect(proteins.every((f) => f.category === 'protein')).toBe(true);
  });
});
