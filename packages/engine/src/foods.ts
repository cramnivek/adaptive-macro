import type { ISODate, Nutrients } from './types.ts';
import { KCAL_PER_G, roundTo } from './units.ts';
import { addMicros, scaleMicros } from './micronutrients.ts';

export type FoodSource =
  | 'openfoodfacts'
  | 'usda'
  | 'custom'
  | 'recipe'
  | 'builtin'
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
  category?: 'protein' | 'carbs' | 'fats' | 'produce' | 'dairy';
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
    micros: scaleMicros(per100g.micros, factor),
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
    micros: scaleMicros(nutrients.micros, factor),
  };
};

export const addNutrients = (a: Nutrients, b: Nutrients): Nutrients => ({
  kcal: a.kcal + b.kcal,
  proteinG: a.proteinG + b.proteinG,
  carbsG: a.carbsG + b.carbsG,
  fatG: a.fatG + b.fatG,
  fiberG: (a.fiberG ?? 0) + (b.fiberG ?? 0),
  micros: addMicros(a.micros, b.micros),
});

export const sumNutrients = (items: Nutrients[]): Nutrients =>
  items.reduce(addNutrients, EMPTY_NUTRIENTS);

export const roundNutrients = (n: Nutrients): Nutrients => ({
  kcal: roundTo(n.kcal),
  proteinG: roundTo(n.proteinG, 1),
  carbsG: roundTo(n.carbsG, 1),
  fatG: roundTo(n.fatG, 1),
  fiberG: roundTo(n.fiberG ?? 0, 1),
  micros: n.micros ? scaleMicros(n.micros, 1) : undefined,
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
  const list = [token];
  if (token.endsWith('es') && token.length > 4) {
    list.push(token.slice(0, -2), token.slice(0, -1));
  } else if (token.endsWith('s') && token.length > 3) {
    list.push(token.slice(0, -1));
  } else if (!token.endsWith('s')) {
    list.push(token + 's');
  }
  return list;
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

/** The words of a query that are worth matching on. */
const queryTokens = (query: string): string[] =>
  normalise(query)
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token));

/**
 * Computes standard Levenshtein edit distance between two strings.
 */
export const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      if (a[i - 1] === b[j - 1]) {
        row[j] = prev;
      } else {
        row[j] = Math.min(prev + 1, row[j] + 1, row[j - 1] + 1);
      }
      prev = temp;
    }
  }

  return row[b.length];
};

/**
 * Checks if a query token is a close typo match for a candidate word.
 *
 * Designed to gracefully catch misspellings like "egf" -> "egg", "chiken" -> "chicken",
 * "bananna" -> "banana", "avocdo" -> "avocado" while avoiding false positive drift on
 * short noisy words.
 */
export const isFuzzyMatch = (queryToken: string, candidateWord: string): boolean => {
  if (queryToken === candidateWord) return true;
  if (candidateWord.includes(queryToken)) return true;

  const qLen = queryToken.length;
  if (qLen < 3) return false;

  const maxDist = qLen <= 4 ? 1 : 2;
  if (Math.abs(candidateWord.length - qLen) > maxDist) return false;

  const dist = levenshteinDistance(queryToken, candidateWord);
  return dist <= maxDist;
};

export const resultsAnswerQuery = (query: string, foods: Food[]): boolean => {
  const tokens = queryTokens(query);

  // Nothing to judge. Not a miss — a query of "of the" has told us nothing.
  if (tokens.length === 0) return true;
  if (foods.length === 0) return false;

  const haystacks = foods.map((food) => normalise(`${food.name} ${food.brand ?? ''}`));
  const wordsList = haystacks.map((h) => h.split(' ').filter(Boolean));

  return tokens.every((token) => {
    const variants = variantsOf(token);
    if (variants.some((variant) => haystacks.some((hay) => hay.includes(variant)))) {
      return true;
    }
    return wordsList.some((words) => words.some((word) => isFuzzyMatch(token, word)));
  });
};

/**
 * Calculates a multi-factor relevance score for a food given a search query.
 *
 * Combines exact-title matches, word-boundary matches, typo tolerance, source authority
 * (builtin > custom > usda > openfoodfacts), title conciseness, and presence
 * of practical household portions.
 */
export const foodRelevanceScore = (query: string, food: Food): number => {
  const normQuery = normalise(query);
  const normName = normalise(food.name);
  const normBrand = food.brand ? normalise(food.brand) : '';
  const tokens = queryTokens(query);
  if (tokens.length === 0) return 0;

  let score = 0;

  // 1. Exact title matches
  if (normName === normQuery) {
    score += 3000;
  } else if (normName.startsWith(normQuery + ' ') || normName.startsWith(normQuery + ',')) {
    score += 1500;
  } else if (normName.startsWith(normQuery)) {
    score += 1200;
  } else if (normName.includes(' ' + normQuery + ' ') || normName.endsWith(' ' + normQuery)) {
    score += 900;
  }

  // 2. Token / word matching
  const nameWords = normName.split(' ');
  const brandWords = normBrand ? normBrand.split(' ') : [];
  let nameTokensCovered = 0;
  let allTokensCovered = 0;

  for (const token of tokens) {
    const variants = variantsOf(token);
    let matchedInName = false;
    let matchedInBrand = false;

    // Word match in name
    if (nameWords.some((w) => variants.includes(w))) {
      score += 250;
      matchedInName = true;
    } else if (nameWords.some((w) => variants.some((v) => w.startsWith(v)))) {
      score += 140;
      matchedInName = true;
    } else if (brandWords.some((w) => variants.includes(w))) {
      score += 80;
      matchedInBrand = true;
    } else if (brandWords.some((w) => variants.some((v) => w.startsWith(v)))) {
      score += 40;
      matchedInBrand = true;
    } else if (variants.some((v) => normName.includes(v))) {
      // Substring fallback
      score += 20;
      matchedInName = true;
    } else if (nameWords.some((w) => isFuzzyMatch(token, w))) {
      // Typo / fuzzy match in food name (e.g. "egf" -> "egg")
      score += 150;
      matchedInName = true;
    } else if (brandWords.some((w) => isFuzzyMatch(token, w))) {
      score += 50;
      matchedInBrand = true;
    }

    if (matchedInName) {
      nameTokensCovered++;
      allTokensCovered++;
    } else if (matchedInBrand) {
      allTokensCovered++;
    }
  }

  // Completeness bonuses
  if (allTokensCovered === tokens.length) {
    score += 400;
  }
  if (nameTokensCovered === tokens.length) {
    score += 300;
  }

  // 3. Source trust weight
  if (food.source === 'builtin') {
    score += 350;
  } else if (food.source === 'custom' || food.source === 'recipe') {
    score += 220;
  } else if (food.source === 'usda') {
    score += 120;
  }

  // 4. Name brevity / simplicity (clean names beat 100-character keyword spam)
  if (normName.length <= 25) {
    score += 70;
  } else if (normName.length <= 45) {
    score += 30;
  } else if (normName.length > 75) {
    score -= Math.min(80, Math.floor((normName.length - 75) / 2));
  }

  // 5. Portions quality bonus (having household portions makes logging far more useful)
  if (food.portions && food.portions.length > 1) {
    score += 60;
  }

  // 6. Macro consistency sanity check
  if (food.per100g && !isNutritionallyConsistent(food.per100g, 0.25)) {
    score -= 200;
  }

  return score;
};

/**
 * How many of the query's words a single food accounts for.
 *
 * `resultsAnswerQuery` asks whether the list as a whole covers the query, which
 * is the right question for deciding to spend a lookup and the wrong one for
 * ordering. Searching `mang inasal pecho` returns `Guava mang`, `Mang Tomas`
 * and `st. mang Limburger`: every one matches on `mang` alone, and they fill
 * the screen above anything useful.
 */
export const queryCoverage = (query: string, food: Food): number => {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return 0;
  const hay = normalise(`${food.name} ${food.brand ?? ''}`);
  return tokens.filter((token) => variantsOf(token).some((v) => hay.includes(v))).length;
};

/**
 * Results ordered by how much of the query they actually account for.
 *
 * A stable sort, so foods covering the same number of words keep the order the
 * sources put them in — which already means cached first, then USDA, then Open
 * Food Facts. Nothing is removed: a one-word match is still the right answer
 * for a one-word query, and hiding rows on a guess is how a search stops being
 * trustworthy.
 */
export const byQueryCoverage = (query: string, foods: Food[]): Food[] =>
  foods
    .map((food, index) => ({ food, index, score: queryCoverage(query, food) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.food);

/**
 * Multi-signal ranking algorithm for food search.
 *
 * Sorts primarily by query coverage and relevance score (exact matches, word
 * boundaries, verified source authority, title brevity, household portions).
 */
export const rankSearchResults = (query: string, foods: Food[]): Food[] =>
  foods
    .map((food, index) => ({
      food,
      index,
      coverage: queryCoverage(query, food),
      score: foodRelevanceScore(query, food),
    }))
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage || a.index - b.index)
    .map((entry) => entry.food);
