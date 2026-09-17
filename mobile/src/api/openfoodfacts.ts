import type { Food, FoodPortion } from '@adaptive-macros/engine';
import { fetchJson, isUsableNumber, kjToKcal } from './http';

const SOURCE = 'Open Food Facts';

/**
 * Open Food Facts serves a per-country view on its own subdomain, holding the
 * products actually sold there. Searching `world` for a local brand buries it
 * under the same name from other markets, or misses it entirely; searching
 * `ph` finds what is on the shelf in front of you.
 *
 * The value is a country code as Open Food Facts uses it, or `world`.
 */
export const DEFAULT_FOOD_COUNTRY = 'world';

const baseFor = (country: string) => {
  const code = country.trim().toLowerCase() || DEFAULT_FOOD_COUNTRY;
  return `https://${code}.openfoodfacts.org`;
};

interface OffNutriments {
  'energy-kcal_100g'?: number;
  energy_100g?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
}

const FIELDS =
  'code,product_name,brands,quantity,serving_size,serving_quantity,nutriments';

/**
 * Builds the portion list for a product.
 *
 * 100 g is always present because that is the basis everything is stored in.
 * A declared serving size is added on top when the product states one, since
 * "1 serving" is how people actually think about packaged food.
 */
const portionsFor = (product: OffProduct): FoodPortion[] => {
  const portions: FoodPortion[] = [{ label: '100 g', grams: 100 }];

  const servingGrams =
    typeof product.serving_quantity === 'string'
      ? Number.parseFloat(product.serving_quantity)
      : product.serving_quantity;

  if (isUsableNumber(servingGrams) && servingGrams > 0) {
    portions.push({
      label: product.serving_size?.trim() || '1 serving',
      grams: servingGrams,
    });
  }

  return portions;
};

/**
 * Converts a product to our Food shape, or null when it is unusable.
 *
 * Open Food Facts is crowd-sourced and a large fraction of entries have no
 * nutrition data at all. Those are dropped here rather than shown as a food
 * with zero calories, which would silently log nothing.
 */
const toFood = (product: OffProduct): Food | null => {
  const nutriments = product.nutriments ?? {};
  const name = product.product_name?.trim();
  if (!name || !product.code) return null;

  const kcal = isUsableNumber(nutriments['energy-kcal_100g'])
    ? nutriments['energy-kcal_100g']
    : isUsableNumber(nutriments.energy_100g)
      ? kjToKcal(nutriments.energy_100g)
      : null;

  if (kcal === null) return null;

  return {
    id: `off:${product.code}`,
    name,
    brand: product.brands?.split(',')[0]?.trim() || undefined,
    barcode: product.code,
    source: 'openfoodfacts',
    per100g: {
      kcal,
      proteinG: isUsableNumber(nutriments.proteins_100g) ? nutriments.proteins_100g : 0,
      carbsG: isUsableNumber(nutriments.carbohydrates_100g)
        ? nutriments.carbohydrates_100g
        : 0,
      fatG: isUsableNumber(nutriments.fat_100g) ? nutriments.fat_100g : 0,
      fiberG: isUsableNumber(nutriments.fiber_100g) ? nutriments.fiber_100g : 0,
    },
    portions: portionsFor(product),
    fetchedAt: new Date().toISOString(),
  };
};

export const searchOpenFoodFacts = async (
  query: string,
  pageSize = 20,
  country: string = DEFAULT_FOOD_COUNTRY,
): Promise<Food[]> => {
  const url =
    `${baseFor(country)}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${FIELDS}`;

  const data = await fetchJson<{ products?: OffProduct[] }>(url, SOURCE);
  return (data.products ?? []).map(toFood).filter((food): food is Food => food !== null);
};

/**
 * Barcodes are looked up against `world` regardless of the country setting: a
 * barcode identifies one product globally, and the country views are subsets,
 * so a local view can only lose a match that world would have found.
 */
export const lookupBarcode = async (barcode: string): Promise<Food | null> => {
  const url = `${baseFor('world')}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  const data = await fetchJson<{ status?: number; product?: OffProduct }>(url, SOURCE);
  if (data.status !== 1 || !data.product) return null;
  return toFood(data.product);
};
