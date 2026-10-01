import type { ISODate, Nutrients } from './types.ts';
import { KCAL_PER_G, roundTo } from './units.ts';

export type FoodSource =
  | 'openfoodfacts'
  | 'usda'
  | 'custom'
  | 'recipe'
  /** Estimated by Claude from a description, then confirmed by the user. */
  | 'ai';

/** A named amount, so the user can log "1 slice" instead of weighing it. */
export interface FoodPortion {
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  /** UPC/EAN, present for scanned packaged items. */
  barcode?: string;
  source: FoodSource;
  /**
   * Nutrients per 100 g. Both food APIs normalise to 100 g, and storing one
   * canonical basis means portion maths is a single multiply everywhere
   * instead of a per-food special case.
   */
  per100g: Nutrients;
  /** Always includes a 100 g entry; APIs may add serving sizes on top. */
  portions: FoodPortion[];
  /** Set when the food came from a remote database, for cache invalidation. */
  fetchedAt?: string;
  /**
   * Domains a grounded lookup actually read to produce this food. Present
   * only for `source: 'ai'` records that came from a web lookup; a photo or
   * description estimate has nothing to cite. Stored so a number's provenance
   * survives long after the lookup, rather than living only in the moment of
   * confirmation.
   */
  sources?: string[];
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface LogEntry {
  id: string;
  date: ISODate;
  foodId: string;
  grams: number;
  meal: Meal;
  /** Denormalised so the diary still renders if a cached food is evicted. */
  foodName: string;
  nutrients: Nutrients;
}

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
};

export const scaleNutrients = (per100g: Nutrients, grams: number): Nutrients => {
  const factor = grams / 100;
  return {
    kcal: per100g.kcal * factor,
    proteinG: per100g.proteinG * factor,
    carbsG: per100g.carbsG * factor,
    fatG: per100g.fatG * factor,
    fiberG: (per100g.fiberG ?? 0) * factor,
  };
};

/**
 * Converts nutrients stated for a portion into the per-100 g basis everything
 * is stored in.
 *
 * The inverse of `scaleNutrients`. This exists because restaurant and menu
 * data is published per serving — "1 piece, 380 kcal" — and doing the division
 * here means no caller, and in particular no language model, is trusted with
 * arithmetic the app can perform exactly.
 */
export const per100gFromPortion = (nutrients: Nutrients, grams: number): Nutrients => {
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new Error(`portion weight must be a positive number of grams, got ${grams}`);
  }
  const factor = 100 / grams;
  return {
    kcal: nutrients.kcal * factor,
    proteinG: nutrients.proteinG * factor,
    carbsG: nutrients.carbsG * factor,
    fatG: nutrients.fatG * factor,
    fiberG: (nutrients.fiberG ?? 0) * factor,
  };
};

export const addNutrients = (a: Nutrients, b: Nutrients): Nutrients => ({
  kcal: a.kcal + b.kcal,
  proteinG: a.proteinG + b.proteinG,
  carbsG: a.carbsG + b.carbsG,
  fatG: a.fatG + b.fatG,
  fiberG: (a.fiberG ?? 0) + (b.fiberG ?? 0),
});

export const sumNutrients = (items: Nutrients[]): Nutrients =>
  items.reduce(addNutrients, EMPTY_NUTRIENTS);

export const roundNutrients = (n: Nutrients): Nutrients => ({
  kcal: roundTo(n.kcal),
  proteinG: roundTo(n.proteinG, 1),
  carbsG: roundTo(n.carbsG, 1),
  fatG: roundTo(n.fatG, 1),
  fiberG: roundTo(n.fiberG ?? 0, 1),
});

/** Signed remainder against a target; negative means over. */
export const remainingAgainst = (target: Nutrients, consumed: Nutrients): Nutrients => ({
  kcal: target.kcal - consumed.kcal,
  proteinG: target.proteinG - consumed.proteinG,
  carbsG: target.carbsG - consumed.carbsG,
  fatG: target.fatG - consumed.fatG,
  fiberG: (target.fiberG ?? 0) - (consumed.fiberG ?? 0),
});

/**
 * Calories implied by the macros, for cross-checking a food's own kcal field.
 *
 * Crowd-sourced database entries are frequently internally inconsistent — the
 * macros say one thing and the calorie field another. Comparing the two is the
 * cheapest available signal that an entry is junk.
 */
export const kcalFromMacros = (n: Nutrients): number =>
  n.proteinG * KCAL_PER_G.protein +
  n.carbsG * KCAL_PER_G.carbs +
  n.fatG * KCAL_PER_G.fat;

/**
 * True when a food's stated calories are within `tolerance` (fractional) of
 * what its macros imply. Foods failing this should be surfaced to the user as
 * suspect rather than silently corrected — the database might be right about
 * kcal and wrong about a macro, and guessing which would be inventing data.
 */
export const isNutritionallyConsistent = (n: Nutrients, tolerance = 0.15): boolean => {
  const implied = kcalFromMacros(n);
  if (n.kcal <= 0) return implied <= 0;
  return Math.abs(implied - n.kcal) / n.kcal <= tolerance;
};

/**
 * Lowercase and unaccented, with every non-alphanumeric character a space.
 *
 * Applied to both sides of the comparison so punctuation cannot decide a
 * match: `Oscar Mayer, Chicken Breast (Honey Glazed)` and `oscar-mayer` have
 * to meet somewhere, and that somewhere is here.
 *
 * Accents are decomposed and stripped first, because they are asymmetric in
 * practice: people type `jalapeno`, databases store `Jalapeño`. Without this
 * the name normalises to `jalape o`, the query word is not a substring of it,
 * and a perfect match spends a charged lookup.
 */
const normalise = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The token itself, and its singular if it looks like a plural.
 *
 * Matching is query-word-inside-result-word, so a longer query word can never
 * match a shorter one in a name: `almonds` misses `Almond, raw` and spends a
 * call on it. Dropping a trailing `s` or `es` covers the overwhelmingly common
 * case without a stemmer. It only ever makes a token easier to cover, which is
 * the direction that withholds a lookup rather than spending one.
 */
const variantsOf = (token: string): string[] => {
  if (token.endsWith('es') && token.length > 4) return [token, token.slice(0, -2), token.slice(0, -1)];
  if (token.endsWith('s') && token.length > 3) return [token, token.slice(0, -1)];
  return [token];
};

/** Words this short carry no signal, and firing a lookup on one spends money on noise. */
const MIN_TOKEN_LENGTH = 3;

/**
 * Function words, which survive the length filter and must not decide a lookup.
 *
 * `the` is exactly three characters. Without this, "bread and butter" turns on
 * whether some result happens to contain `and` inside a longer word — `Island`
 * does, `Sourdough` does not — which is a coin toss deciding a charged call.
 */
const STOPWORDS = new Set(['and', 'the', 'with', 'for', 'from']);

/**
 * True when the results plausibly answer the query.
 *
 * Search `crispyking breast` and the databases return twelve kinds of poultry:
 * confident, correctly formatted, and not the thing you asked for. Auto-lookup
 * used to be gated on an empty result list, so the one case where the
 * databases are weakest — branded and restaurant items — was the one case AI
 * could not reach.
 *
 * A model call is not needed to see the problem. `crispyking` appears in none
 * of the twelve names. So: every query word of three or more characters must
 * turn up somewhere in some result's name or brand. One word that does not is
 * the whole signal.
 *
 * Matching is by substring rather than whole word, which covers `breasts` for
 * `breast` and also lets `graham` cover `ham`. That false positive is the
 * direction worth being wrong in — it withholds a charged lookup rather than
 * spending one.
 */
export const resultsAnswerQuery = (query: string, foods: Food[]): boolean => {
  const tokens = normalise(query)
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token));

  // Nothing to judge. Not a miss — a query of "of the" has told us nothing.
  if (tokens.length === 0) return true;
  if (foods.length === 0) return false;

  const haystacks = foods.map((food) => normalise(`${food.name} ${food.brand ?? ''}`));
  return tokens.every((token) =>
    variantsOf(token).some((variant) => haystacks.some((hay) => hay.includes(variant))),
  );
};
