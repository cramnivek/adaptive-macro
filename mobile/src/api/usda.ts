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

interface FdcMeasure {
  id?: number;
  disseminationText?: string;
  gramWeight?: number;
  modifier?: string;
}

interface FdcPortion {
  id?: number;
  gramWeight?: number;
  portionDescription?: string;
  modifier?: string;
  measureUnit?: {
    name?: string;
  };
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
  foodMeasures?: FdcMeasure[];
  foodPortions?: FdcPortion[];
}

const nutrientValue = (nutrients: FdcNutrient[], id: number): number => {
  const match = nutrients.find((n) => n.nutrientId === id);
  return isUsableNumber(match?.value) ? match.value : 0;
};

/**
 * Serving portions from USDA declared food measures, portions, or serving sizes.
 *
 * Captures household amounts ("1 large", "1 cup", "1 breast") from Foundation
 * and SR Legacy data so users aren't restricted to weighing only in grams.
 */
const portionsFor = (food: FdcFood): FoodPortion[] => {
  const portions: FoodPortion[] = [{ label: '100 g', grams: 100 }];
  const seenGrams = new Set<number>([100]);

  // 1. Check FDC foodMeasures (common in SR Legacy)
  if (Array.isArray(food.foodMeasures)) {
    for (const measure of food.foodMeasures) {
      const grams = measure.gramWeight;
      if (!isUsableNumber(grams) || grams <= 0 || seenGrams.has(Math.round(grams))) continue;
      const label = measure.disseminationText?.trim() || measure.modifier?.trim();
      if (label) {
        seenGrams.add(Math.round(grams));
        portions.push({
          label: `${label} (${Math.round(grams)} g)`,
          grams: Math.round(grams * 10) / 10,
        });
      }
    }
  }

  // 2. Check FDC foodPortions (common in Foundation foods)
  if (Array.isArray(food.foodPortions)) {
    for (const portion of food.foodPortions) {
      const grams = portion.gramWeight;
      if (!isUsableNumber(grams) || grams <= 0 || seenGrams.has(Math.round(grams))) continue;
      const label =
        portion.portionDescription?.trim() ||
        portion.modifier?.trim() ||
        portion.measureUnit?.name?.trim();
      if (label) {
        seenGrams.add(Math.round(grams));
        portions.push({
          label: `${label} (${Math.round(grams)} g)`,
          grams: Math.round(grams * 10) / 10,
        });
      }
    }
  }

  // 3. Branded item declared serving size
  const unit = food.servingSizeUnit?.toLowerCase();
  if (isUsableNumber(food.servingSize) && food.servingSize > 0 && (unit === 'g' || unit === 'ml')) {
    const grams = food.servingSize;
    if (!seenGrams.has(Math.round(grams))) {
      portions.push({
        label: food.householdServingFullText?.trim() || `1 serving (${Math.round(grams)} ${unit})`,
        grams: Math.round(grams * 10) / 10,
      });
    }
  }

  return portions;
};

export const formatUsdaName = (description: string): string => {
  let cleaned = description
    .replace(/\s*\([^)]*Food Distribution Program[^)]*\)/gi, '')
    .replace(/\s*\([^)]*Commodity[^)]*\)/gi, '')
    .replace(/\bbroilers or fryers,\s*/gi, '')
    .trim();

  return cleaned
    .toLowerCase()
    .replace(/(^|[\s,(/-])([a-z])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase());
};

const MICRO_IDS = {
  calciumMg: 1087,
  ironMg: 1089,
  magnesiumMg: 1090,
  phosphorusMg: 1091,
  potassiumMg: 1092,
  sodiumMg: 1093,
  zincMg: 1095,
  copperMg: 1098,
  manganeseMg: 1101,
  seleniumMcg: 1103,
  vitaminCMg: 1162,
  thiaminB1Mg: 1165,
  riboflavinB2Mg: 1166,
  niacinB3Mg: 1167,
  pantothenicAcidB5Mg: 1170,
  pyridoxineB6Mg: 1175,
  folateB9Mcg: 1177,
  cobalaminB12Mcg: 1178,
  cholineMg: 1180,
  vitaminAMcg: 1106,
  vitaminEMg: 1109,
  vitaminKMcg: 1185,
  saturatedFatG: 1258,
  monounsaturatedFatG: 1292,
  polyunsaturatedFatG: 1293,
  transFatG: 1257,
  cholesterolMg: 1253,
  sugarG: 2000,
  addedSugarG: 1235,
} as const;

const toFood = (food: FdcFood): Food | null => {
  const nutrients = food.foodNutrients ?? [];
  const description = food.description?.trim();
  if (!description) return null;

  const kcal = nutrientValue(nutrients, NUTRIENT_IDS.kcal);
  // A USDA entry with no energy value is an incomplete record, not a zero
  // calorie food, so it is dropped rather than logged as free.
  if (kcal <= 0) return null;

  const micros: Record<string, number> = {};
  for (const [key, id] of Object.entries(MICRO_IDS)) {
    const val = nutrientValue(nutrients, id);
    if (val > 0) {
      micros[key] = val;
    }
  }
  // Vitamin D is stored in IU. FoodData Central gives it as 1110 (IU) on some
  // records and only as 1114 (micrograms) on others; reading 1114 as IU made
  // vitamin D about forty times too low. 1 µg of vitamin D is 40 IU.
  const vitaminDIU = nutrientValue(nutrients, 1110) || nutrientValue(nutrients, 1114) * 40;
  if (vitaminDIU > 0) micros.vitaminDIU = vitaminDIU;

  return {
    id: `usda:${food.fdcId}`,
    name: formatUsdaName(description),
    brand: food.brandName?.trim() || food.brandOwner?.trim() || undefined,
    barcode: food.gtinUpc?.trim() || undefined,
    source: 'usda',
    per100g: {
      kcal,
      proteinG: nutrientValue(nutrients, NUTRIENT_IDS.protein),
      carbsG: nutrientValue(nutrients, NUTRIENT_IDS.carbs),
      fatG: nutrientValue(nutrients, NUTRIENT_IDS.fat),
      fiberG: nutrientValue(nutrients, NUTRIENT_IDS.fiber),
      micros: Object.keys(micros).length > 0 ? (micros as any) : undefined,
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
