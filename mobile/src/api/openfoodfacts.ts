import type { Food, FoodPortion } from '@adaptive-macros/engine';
import { fetchJson, isUsableNumber, kjToKcal } from './http';
import { PROXY_TOKEN } from './gemini';

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
  // The legacy endpoint returns brands as one comma-separated string; the
  // newer Search-a-licious endpoint returns an array. Both endpoints feed
  // the same product shape into toFood, so both are accepted here.
  brands?: string | string[];
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
}

const FIELDS =
  'code,product_name,brands,quantity,serving_size,serving_quantity,nutriments';

/** First brand, regardless of which shape the endpoint gave it to us in. */
const firstBrand = (brands: OffProduct['brands']): string | undefined => {
  const raw = Array.isArray(brands) ? brands[0] : brands?.split(',')[0];
  return raw?.trim() || undefined;
};

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
    brand: firstBrand(product.brands),
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

const SEARCH_A_LICIOUS_URL = 'https://search.openfoodfacts.org/search';

/**
 * OFF's search endpoints send no CORS headers, so a browser cannot call them
 * at all — measured, a plain GET with no custom headers still fails. On web
 * the search goes through this app's own origin, which serves the app and can
 * reach OFF server-side. Native calls OFF directly: it has no CORS problem and
 * no reason to add a hop.
 *
 * `lookupBarcode` is deliberately not routed: that endpoint does send CORS
 * headers and works from a browser as it is.
 */
const searchViaProxy = (): boolean => typeof document !== 'undefined';

const proxyHeaders = (): Record<string, string> =>
  searchViaProxy() ? { 'x-proxy-token': PROXY_TOKEN } : {};

/**
 * Search-a-licious is Open Food Facts' newer search index. Unlike
 * `cgi/search.pl` below, it has been consistently available in testing, so it
 * is tried first.
 *
 * It is one global index with no per-country subdomains. It does accept a
 * `countries_tags:"en:<country name>"` filter, but the app's `foodCountry`
 * setting stores ISO-style codes like `ph`, not names, and building a
 * code-to-name table just to file this filter is scope creep this migration
 * doesn't need. So this call is always global, and the country-specific view
 * is left to the legacy fallback below, when it's reachable.
 *
 * It also does not return `serving_size`, `serving_quantity` or `quantity`,
 * even when asked for via `fields` — confirmed against the live API, not an
 * oversight here. Foods found this way therefore only ever get the generic
 * 100 g portion; foods from the legacy fallback can still carry a named
 * serving. That asymmetry is accepted rather than worked around.
 */
const searchSearchALicious = async (query: string, pageSize: number): Promise<Food[]> => {
  const url = searchViaProxy()
    ? `/api/off/search?q=${encodeURIComponent(query)}&page_size=${pageSize}`
    : `${SEARCH_A_LICIOUS_URL}?q=${encodeURIComponent(query)}&page_size=${pageSize}`;
  const data = await fetchJson<{ hits?: OffProduct[] }>(url, SOURCE, 10_000, proxyHeaders());
  return (data.hits ?? []).map(toFood).filter((food): food is Food => food !== null);
};

const searchLegacy = async (
  query: string,
  pageSize: number,
  country: string,
): Promise<Food[]> => {
  const url = searchViaProxy()
    ? `/api/off/legacy?q=${encodeURIComponent(query)}` +
      `&page_size=${pageSize}&country=${encodeURIComponent(country)}`
    : `${baseFor(country)}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${FIELDS}`;

  const data = await fetchJson<{ products?: OffProduct[] }>(url, SOURCE, 10_000, proxyHeaders());
  return (data.products ?? []).map(toFood).filter((food): food is Food => food !== null);
};

/**
 * `cgi/search.pl` is intermittent — measured directly, the same URL returns
 * 503 and then 200 seconds apart. That looks like transient load rather than
 * the endpoint being actually down, so it's worth one retry before treating
 * it as failed.
 */
export const searchOpenFoodFacts = async (
  query: string,
  pageSize = 20,
  country: string = DEFAULT_FOOD_COUNTRY,
): Promise<Food[]> => {
  try {
    const hits = await searchSearchALicious(query, pageSize);
    if (hits.length > 0) return hits;
  } catch {
    // Falls through to the legacy endpoint below.
  }

  try {
    return await searchLegacy(query, pageSize, country);
  } catch {
    return await searchLegacy(query, pageSize, country);
  }
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
