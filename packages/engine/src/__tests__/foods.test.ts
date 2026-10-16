import { describe, expect, it } from 'vitest';
import {
  foodRelevanceScore,
  isFuzzyMatch,
  isNutritionallyConsistent,
  levenshteinDistance,
  rankSearchResults,
  resultsAnswerQuery,
  type Food,
} from '../foods.ts';

describe('food search and ranking', () => {
  const egg: Food = {
    id: 'builtin:egg-whole',
    name: 'Whole Egg',
    source: 'builtin',
    per100g: { kcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5, fiberG: 0 },
    portions: [
      { label: '100 g', grams: 100 },
      { label: '1 large (50 g)', grams: 50 },
    ],
  };

  const reggiano: Food = {
    id: 'off:reggiano',
    name: 'Parmigiano Reggiano',
    brand: 'Italian Cheeses',
    source: 'openfoodfacts',
    per100g: { kcal: 392, proteinG: 32, carbsG: 0, fatG: 28, fiberG: 0 },
    portions: [{ label: '100 g', grams: 100 }],
  };

  const eggplant: Food = {
    id: 'usda:eggplant',
    name: 'Eggplant, raw',
    source: 'usda',
    per100g: { kcal: 25, proteinG: 1, carbsG: 6, fatG: 0.2, fiberG: 3 },
    portions: [{ label: '100 g', grams: 100 }],
  };

  const chickenBreast: Food = {
    id: 'builtin:chicken-breast',
    name: 'Chicken Breast (Cooked)',
    source: 'builtin',
    per100g: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, fiberG: 0 },
    portions: [
      { label: '100 g', grams: 100 },
      { label: '1 medium breast (172 g)', grams: 172 },
    ],
  };

  it('ranks exact and word-boundary matches above random substring matches', () => {
    const scoredEgg = foodRelevanceScore('egg', egg);
    const scoredEggplant = foodRelevanceScore('egg', eggplant);
    const scoredReggiano = foodRelevanceScore('egg', reggiano);

    expect(scoredEgg).toBeGreaterThan(scoredEggplant);
    expect(scoredEgg).toBeGreaterThan(scoredReggiano);
  });

  it('orders search results by relevance correctly with rankSearchResults', () => {
    const list = [reggiano, eggplant, egg];
    const ranked = rankSearchResults('egg', list);

    expect(ranked[0].id).toBe('builtin:egg-whole');
  });

  it('matches multi-word queries prioritizing whole-food matches', () => {
    const spamChicken: Food = {
      id: 'off:chicken-spam',
      name: 'Chicken Breast Patties Breaded Rib Meat Deep Fried Nuggets',
      source: 'openfoodfacts',
      per100g: { kcal: 280, proteinG: 14, carbsG: 18, fatG: 17, fiberG: 1 },
      portions: [{ label: '100 g', grams: 100 }],
    };

    const ranked = rankSearchResults('chicken breast', [spamChicken, chickenBreast]);
    expect(ranked[0].id).toBe('builtin:chicken-breast');
  });

  it('flags nutritionally inconsistent foods', () => {
    expect(
      isNutritionallyConsistent({
        kcal: 100,
        proteinG: 30, // 120 kcal
        carbsG: 10,   // 40 kcal
        fatG: 10,     // 90 kcal -> total 250 kcal vs stated 100 kcal
        fiberG: 0,
      }),
    ).toBe(false);

    expect(
      isNutritionallyConsistent({
        kcal: 165,
        proteinG: 31,
        carbsG: 0,
        fatG: 3.6,
        fiberG: 0,
      }),
    ).toBe(true);
  });

  it('tolerates common typos and misspellings (egf -> egg, chiken -> chicken)', () => {
    // 1. Scoring & ranking with typo "egf"
    const scoreEgg = foodRelevanceScore('egf', egg);
    const scoreReggiano = foodRelevanceScore('egf', reggiano);
    expect(scoreEgg).toBeGreaterThan(scoreReggiano);

    const rankedEgg = rankSearchResults('egf', [reggiano, eggplant, egg]);
    expect(rankedEgg[0].id).toBe('builtin:egg-whole');

    // 2. Scoring & ranking with typo "chiken"
    const rankedChicken = rankSearchResults('chiken', [reggiano, chickenBreast, eggplant]);
    expect(rankedChicken[0].id).toBe('builtin:chicken-breast');

    // 3. resultsAnswerQuery returns true for close typo
    expect(resultsAnswerQuery('egf', [egg])).toBe(true);
    expect(resultsAnswerQuery('chiken', [chickenBreast])).toBe(true);
  });
});
