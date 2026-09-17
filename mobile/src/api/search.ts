import type { Food } from '@adaptive-macros/engine';
import { searchLocalFoods } from '../db';
import { FoodApiError } from './http';
import { DEFAULT_FOOD_COUNTRY, searchOpenFoodFacts } from './openfoodfacts';
import { USDA_DEMO_KEY, searchUsda } from './usda';

export interface SearchResults {
  foods: Food[];
  /** Sources that failed, so the UI can say which ones rather than failing silently. */
  errors: string[];
}

/**
 * Searches every source at once and merges the results.
 *
 * Ordering is cached-first, then USDA, then Open Food Facts. Foods already in
 * the local cache are ones this user has eaten before, so they are almost
 * always the intended match; USDA outranks OFF because its whole-food data is
 * curated rather than crowd-sourced.
 *
 * Sources are queried in parallel and failures are collected instead of
 * thrown — one API being down should still leave the search usable.
 */
export const searchFoods = async (
  query: string,
  usdaApiKey: string = USDA_DEMO_KEY,
  country: string = DEFAULT_FOOD_COUNTRY,
): Promise<SearchResults> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { foods: [], errors: [] };

  const local = searchLocalFoods(trimmed);
  const usda = searchUsda(trimmed, usdaApiKey);
  // The country view first, then the global one. Both are queried because a
  // country view is a subset: it finds the local brand, and world still covers
  // anything imported or not yet tagged to that country.
  const localMarket = searchOpenFoodFacts(trimmed, 20, country);
  const worldMarket =
    country === DEFAULT_FOOD_COUNTRY
      ? Promise.resolve<Food[]>([])
      : searchOpenFoodFacts(trimmed, 20, DEFAULT_FOOD_COUNTRY);

  const [localResult, usdaResult, localMarketResult, worldResult] = await Promise.allSettled([
    local,
    usda,
    localMarket,
    worldMarket,
  ]);

  const errors: string[] = [];
  const foods: Food[] = [];
  const seen = new Set<string>();

  const collect = (result: PromiseSettledResult<Food[]>) => {
    if (result.status === 'fulfilled') {
      for (const food of result.value) {
        if (seen.has(food.id)) continue;
        seen.add(food.id);
        foods.push(food);
      }
      return;
    }
    const reason = result.reason;
    errors.push(reason instanceof FoodApiError ? reason.message : 'A food source failed');
  };

  collect(localResult);
  collect(usdaResult);
  collect(localMarketResult);
  collect(worldResult);

  return { foods, errors };
};
