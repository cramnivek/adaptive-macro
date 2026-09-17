import type { Food, FoodPortion } from '@adaptive-macros/engine';
import { fetchJson, isUsableNumber } from './http';

const BASE = 'https://api.nal.usda.gov/fdc/v1';
const SOURCE = 'USDA FoodData Central';

/**
 * DEMO_KEY works without signing up but is rate limited to roughly 30 requests
 * per hour per IP, which a single search session can burn through. Users get
 * their own free key at https://fdc.nal.usda.gov/api-key-signup.html.
 */
export const USDA_DEMO_KEY = 'DEMO_KEY';

/** FoodData Central nutrient ids for the fields this app tracks. */
const NUTRIENT_IDS = {
  kcal: 1008,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fiber: 1079,
} as const;

interface FdcNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  value?: number;
  unitName?: string;
}

interface FdcFood {
  fdcId: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  dataType?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: FdcNutrient[];
}

const nutrientValue = (nutrients: FdcNutrient[], id: number): number => {
  const match = nutrients.find((n) => n.nutrientId === id);
  return isUsableNumber(match?.value) ? match.value : 0;
};

/**
 * Serving portions from a branded item's declared serving size.
 *
 * Only grams and millilitres are accepted: for anything else the unit-to-gram
 * conversion is unknown, and inventing one would put a wrong number straight
 * into the food log. Those items fall back to weighing in grams.
 */
const portionsFor = (food: FdcFood): FoodPortion[] => {
  const portions: FoodPortion[] = [{ label: '100 g', grams: 100 }];
  const unit = food.servingSizeUnit?.toLowerCase();

  if (isUsableNumber(food.servingSize) && food.servingSize > 0 && (unit === 'g' || unit === 'ml')) {
    portions.push({
      label: food.householdServingFullText?.trim() || `1 serving (${food.servingSize} ${unit})`,
      grams: food.servingSize,
    });
  }

  return portions;
};

const toFood = (food: FdcFood): Food | null => {
  const nutrients = food.foodNutrients ?? [];
  const description = food.description?.trim();
  if (!description) return null;

  const kcal = nutrientValue(nutrients, NUTRIENT_IDS.kcal);
  // A USDA entry with no energy value is an incomplete record, not a zero
  // calorie food, so it is dropped rather than logged as free.
  if (kcal <= 0) return null;

  return {
    id: `usda:${food.fdcId}`,
    // Descriptions are shouted in the source data ("CHICKEN, BROILERS ...").
    name: description
      .toLowerCase()
      .replace(/(^|[\s,(])([a-z])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase()),
    brand: food.brandName?.trim() || food.brandOwner?.trim() || undefined,
    barcode: food.gtinUpc?.trim() || undefined,
    source: 'usda',
    per100g: {
      kcal,
      proteinG: nutrientValue(nutrients, NUTRIENT_IDS.protein),
      carbsG: nutrientValue(nutrients, NUTRIENT_IDS.carbs),
      fatG: nutrientValue(nutrients, NUTRIENT_IDS.fat),
      fiberG: nutrientValue(nutrients, NUTRIENT_IDS.fiber),
    },
    portions: portionsFor(food),
    fetchedAt: new Date().toISOString(),
  };
};

export const searchUsda = async (
  query: string,
  apiKey: string = USDA_DEMO_KEY,
  pageSize = 20,
): Promise<Food[]> => {
  // Foundation and SR Legacy hold the authoritative whole-food data, which is
  // exactly where Open Food Facts is weakest; Branded is left to OFF.
  const url =
    `${BASE}/foods/search?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(query)}&pageSize=${pageSize}` +
    `&dataType=${encodeURIComponent('Foundation,SR Legacy')}`;

  const data = await fetchJson<{ foods?: FdcFood[] }>(url, SOURCE);
  return (data.foods ?? []).map(toFood).filter((food): food is Food => food !== null);
};
