import type { Food, FoodPortion } from '@adaptive-macros/engine';
import { PROXY_TOKEN, proxyBase } from './gemini';
import { fetchJson, isUsableNumber } from './http';

const BASE = 'https://api.nal.usda.gov/fdc/v1';
const SOURCE = 'USDA FoodData Central';

/**
 * The default setting value, and the marker for "no key of my own".
 *
 * It is no longer sent upstream from here: a search left on this value goes
 * through the app's proxy, which holds the shared key. The literal remains
 * because it is the stored default in existing installs and in settings.ts,
 * and because USDA still accepts it if a request ever does reach them with it
 * — rate limited to roughly 30 requests per hour per IP, which one search
 * session can burn through.
 *
 * A user who wants their own quota gets a free key at
 * https://fdc.nal.usda.gov/api-key-signup.html and enters it in Settings,
 * which takes precedence over the proxy.
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

/**
 * True when this search should go through the app's own proxy.
 *
 * A key the user entered in Settings always wins, on every platform: it keeps
 * bring-your-own-key users off the shared quota, and makes a proxy outage
 * degrade to "enter a key" rather than to a broken feature. This mirrors how
 * `gemini.ts` chooses between a personal key and the hosted route.
 *
 * Otherwise the proxy answers, because the shared key lives there. Unlike the
 * Open Food Facts search this is not about reachability — USDA does send CORS
 * headers and a browser can call it directly — it is about not shipping the
 * key to every client that loads the app.
 */
const searchViaProxy = (apiKey: string): boolean =>
  !apiKey.trim() || apiKey.trim() === USDA_DEMO_KEY;

export const searchUsda = async (
  query: string,
  apiKey: string = USDA_DEMO_KEY,
  pageSize = 20,
): Promise<Food[]> => {
  // Foundation and SR Legacy hold the authoritative whole-food data, which is
  // exactly where Open Food Facts is weakest; Branded is left to OFF. The
  // proxy fixes the same pair server-side, so both routes return like for like.
  const viaProxy = searchViaProxy(apiKey);
  const url = viaProxy
    ? `${proxyBase()}/api/usda/search?q=${encodeURIComponent(query)}&page_size=${pageSize}`
    : `${BASE}/foods/search?api_key=${encodeURIComponent(apiKey)}` +
      `&query=${encodeURIComponent(query)}&pageSize=${pageSize}` +
      `&dataType=${encodeURIComponent('Foundation,SR Legacy')}`;

  const headers: Record<string, string> = viaProxy ? { 'x-proxy-token': PROXY_TOKEN } : {};

  const data = await fetchJson<{ foods?: FdcFood[] }>(url, SOURCE, 10_000, headers);
  return (data.foods ?? []).map(toFood).filter((food): food is Food => food !== null);
};
