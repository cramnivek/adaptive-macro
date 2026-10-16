import type { MovementPattern } from './ai/exercises';
import { type CardioMode, detectCardio, detectCardioMode } from './cardio';
import type { CatalogueEntry } from './db';

/**
 * A unified exercise search item, combining catalogue metadata and user history.
 */
export interface ExerciseSearchResult {
  id: string;
  /** The name to display and record: user's history name if present, else canonical. */
  name: string;
  canonicalName: string;
  recordedName?: string | null;
  movementPattern?: MovementPattern | string;
  primaryMuscle?: string;
  equipment?: string;
  bodyweightBased: boolean;
  isCardio: boolean;
  cardioMode?: CardioMode | null;
  /** Whether this exercise came from the user's logged workout history. */
  isHistory: boolean;
  /** Relevance score for ranking. Higher is better. */
  score: number;
}

export interface KnownExercise {
  name: string;
  bodyweightBased: boolean;
  isCardio?: boolean;
  cardioMode?: CardioMode | null;
}

/**
 * Single-token gym synonyms (OR alternatives).
 * e.g. "db" matches "db" OR "dumbbell".
 */
const GYM_SYNONYMS: Record<string, string[]> = {
  db: ['dumbbell'],
  bb: ['barbell'],
  kb: ['kettlebell'],
  tri: ['tricep', 'triceps'],
  bi: ['bicep', 'biceps'],
  sq: ['squat'],
  dl: ['deadlift'],
  inc: ['incline'],
  dec: ['decline'],
  ext: ['extension'],
  lat: ['lat', 'pulldown'],
  pu: ['pull-up', 'push-up'],
  ez: ['ez'],
};

/**
 * Multi-word gym acronyms (AND requirements).
 * e.g. "ohp" requires BOTH "overhead" AND "press".
 */
const GYM_ACRONYMS: Record<string, string[][]> = {
  ohp: [['overhead'], ['press']],
  rdl: [['romanian'], ['deadlift']],
  sldl: [['stiff'], ['leg', 'legs'], ['deadlift']],
  bp: [['bench'], ['press']],
  sm: [['smith'], ['machine']],
};

/**
 * Normalizes a text string into clean search tokens.
 */
export const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
};

/**
 * Expands query tokens using gym synonyms and multi-word acronyms.
 */
export const expandQueryTokens = (tokens: string[]): string[][] => {
  const groups: string[][] = [];
  for (const token of tokens) {
    if (GYM_ACRONYMS[token]) {
      // Each component word of the acronym is a required match group
      groups.push(...GYM_ACRONYMS[token]);
    } else if (GYM_SYNONYMS[token]) {
      groups.push([token, ...GYM_SYNONYMS[token]]);
    } else {
      groups.push([token]);
    }
  }
  return groups;
};

/**
 * Calculates a search score for a candidate against a query.
 * Returns 0 if candidate does not match all query token groups.
 */
export const scoreCandidate = (
  query: string,
  queryTokens: string[],
  expandedTokenGroups: string[][],
  name: string,
  canonicalName: string,
  primaryMuscle?: string,
  equipment?: string,
  isHistory = false,
): number => {
  const normName = name.toLowerCase();
  const normCanonical = canonicalName.toLowerCase();
  const normMuscle = (primaryMuscle ?? '').toLowerCase();
  const normEquipment = (equipment ?? '').toLowerCase();

  const nameWords = tokenize(name);
  const canonicalWords = tokenize(canonicalName);
  const allTargetWords = [...nameWords, ...canonicalWords];

  const trimmedQuery = query.trim().toLowerCase();

  // 1. Exact match on either recorded or canonical name
  if (normName === trimmedQuery || normCanonical === trimmedQuery) {
    return 1000 + (isHistory ? 150 : 0);
  }

  // 2. Name starts with the exact query string
  let prefixBonus = 0;
  if (normName.startsWith(trimmedQuery) || normCanonical.startsWith(trimmedQuery)) {
    prefixBonus = 400;
  }

  // 3. Acronym match: e.g. "ohp" for "Overhead Press", "rdl" for "Romanian Deadlift"
  let acronymBonus = 0;
  const acronym = allTargetWords.map((w) => w[0]).join('');
  if (trimmedQuery.length >= 2 && acronym.includes(trimmedQuery)) {
    acronymBonus = 350;
  }

  // 4. Token group matching (every token group must have at least one token match)
  let tokenScore = 0;
  for (const group of expandedTokenGroups) {
    let groupMatched = false;
    let groupBestScore = 0;

    for (const token of group) {
      // Word prefix match in name (e.g. token "bench" matches "Bench" or "Benchpress")
      const wordPrefixMatch = allTargetWords.some((word) => word.startsWith(token));
      if (wordPrefixMatch) {
        groupMatched = true;
        groupBestScore = Math.max(groupBestScore, 120);
        continue;
      }

      // Substring match in name
      if (normName.includes(token) || normCanonical.includes(token)) {
        groupMatched = true;
        groupBestScore = Math.max(groupBestScore, 70);
        continue;
      }

      // Equipment match (e.g. "dumbbell", "barbell", "cable")
      if (normEquipment.includes(token)) {
        groupMatched = true;
        groupBestScore = Math.max(groupBestScore, 45);
        continue;
      }

      // Muscle match (e.g. "chest", "biceps", "quads")
      if (normMuscle.includes(token)) {
        groupMatched = true;
        groupBestScore = Math.max(groupBestScore, 35);
        continue;
      }
    }

    if (!groupMatched) {
      // Failed to match this required query token
      return 0;
    }

    tokenScore += groupBestScore;
  }

  // History boost: exercises the user has actually logged receive high priority
  const historyBonus = isHistory ? 180 : 0;

  // Length tiebreaker: shorter, simpler names get a slight edge
  const lengthTiebreaker = Math.max(0, 30 - Math.min(name.length, canonicalName.length));

  return prefixBonus + acronymBonus + tokenScore + historyBonus + lengthTiebreaker;
};

/**
 * Searches and ranks exercises from catalogue and history.
 */
export const searchExercisesFast = ({
  query,
  catalogue,
  known,
  isCardio = false,
  limit = 30,
}: {
  query: string;
  catalogue: CatalogueEntry[];
  known: KnownExercise[];
  isCardio?: boolean;
  limit?: number;
}): ExerciseSearchResult[] => {
  const trimmed = query.trim();

  // --- Empty query: Return top suggestions ---
  if (!trimmed) {
    const results: ExerciseSearchResult[] = [];
    const seenNames = new Set<string>();

    if (isCardio) {
      // Cardio mode empty query: user cardio history first
      for (const item of known) {
        if (item.isCardio) {
          seenNames.add(item.name.toLowerCase());
          results.push({
            id: `known:${item.name}`,
            name: item.name,
            canonicalName: item.name,
            bodyweightBased: item.bodyweightBased,
            isCardio: true,
            cardioMode: item.cardioMode ?? 'treadmill',
            isHistory: true,
            score: 100,
          });
        }
      }
      return results.slice(0, limit);
    }

    // Strength mode empty query: Return top frequent exercises from user history
    for (const item of known) {
      if (item.isCardio) continue;
      const lower = item.name.toLowerCase();
      if (seenNames.has(lower)) continue;
      seenNames.add(lower);

      const catEntry = catalogue.find(
        (c) =>
          c.canonicalName.toLowerCase() === lower ||
          c.recordedName?.toLowerCase() === lower,
      );

      results.push({
        id: catEntry ? catEntry.id : `known:${item.name}`,
        name: item.name,
        canonicalName: catEntry ? catEntry.canonicalName : item.name,
        recordedName: item.name,
        movementPattern: catEntry?.movementPattern,
        primaryMuscle: catEntry?.primaryMuscle,
        equipment: catEntry?.equipment,
        bodyweightBased: item.bodyweightBased,
        isCardio: false,
        cardioMode: item.cardioMode,
        isHistory: true,
        score: 100,
      });

      if (results.length >= 10) break;
    }

    return results;
  }

  // --- Active search query ---
  const queryTokens = tokenize(trimmed);
  const expandedGroups = expandQueryTokens(queryTokens);

  const candidates: ExerciseSearchResult[] = [];
  const seenCanonical = new Set<string>();
  const seenNames = new Set<string>();

  // 1. Process catalogue entries
  for (const entry of catalogue) {
    const effectiveName = entry.recordedName ?? entry.canonicalName;
    const historyItem = known.find(
      (k) =>
        k.name.toLowerCase() === effectiveName.toLowerCase() ||
        k.name.toLowerCase() === entry.canonicalName.toLowerCase(),
    );

    const isEntryCardio = historyItem?.isCardio ?? detectCardio(effectiveName);
    if (isCardio !== isEntryCardio) {
      // If user is searching cardio tab, filter out non-cardio, and vice versa
      continue;
    }

    const score = scoreCandidate(
      trimmed,
      queryTokens,
      expandedGroups,
      effectiveName,
      entry.canonicalName,
      entry.primaryMuscle,
      entry.equipment,
      Boolean(historyItem),
    );

    if (score > 0) {
      seenCanonical.add(entry.canonicalName.toLowerCase());
      seenNames.add(effectiveName.toLowerCase());
      candidates.push({
        id: entry.id,
        name: effectiveName,
        canonicalName: entry.canonicalName,
        recordedName: entry.recordedName,
        movementPattern: entry.movementPattern,
        primaryMuscle: entry.primaryMuscle,
        equipment: entry.equipment,
        bodyweightBased: historyItem?.bodyweightBased ?? entry.bodyweightBased,
        isCardio: isEntryCardio,
        cardioMode: historyItem?.cardioMode ?? detectCardioMode(effectiveName),
        isHistory: Boolean(historyItem),
        score,
      });
    }
  }

  // 2. Process known history exercises that are not yet in catalogue
  for (const item of known) {
    const lowerName = item.name.toLowerCase();
    if (seenNames.has(lowerName) || seenCanonical.has(lowerName)) {
      continue;
    }

    const itemIsCardio = item.isCardio ?? detectCardio(item.name);
    if (isCardio !== itemIsCardio) {
      continue;
    }

    const score = scoreCandidate(
      trimmed,
      queryTokens,
      expandedGroups,
      item.name,
      item.name,
      undefined,
      undefined,
      true,
    );

    if (score > 0) {
      seenNames.add(lowerName);
      candidates.push({
        id: `known:${item.name}`,
        name: item.name,
        canonicalName: item.name,
        recordedName: item.name,
        bodyweightBased: item.bodyweightBased,
        isCardio: itemIsCardio,
        cardioMode: item.cardioMode ?? detectCardioMode(item.name),
        isHistory: true,
        score,
      });
    }
  }

  // Sort descending by score, tiebreak alphabetically
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return candidates.slice(0, limit);
};

// --- In-Memory Singleton Catalogue Cache ---
let inMemoryCatalogue: CatalogueEntry[] | null = null;
let warmPromise: Promise<CatalogueEntry[]> | null = null;

/**
 * Pre-warms or retrieves the cached catalogue in memory.
 */
export const warmCatalogueCache = async (
  loadFn: () => Promise<CatalogueEntry[]>,
): Promise<CatalogueEntry[]> => {
  if (inMemoryCatalogue) return inMemoryCatalogue;
  if (warmPromise) return warmPromise;

  warmPromise = loadFn()
    .then((entries) => {
      inMemoryCatalogue = entries;
      warmPromise = null;
      return entries;
    })
    .catch((err) => {
      warmPromise = null;
      throw err;
    });

  return warmPromise;
};

/** Returns the synchronous in-memory catalogue if ready. */
export const getCachedCatalogue = (): CatalogueEntry[] | null => inMemoryCatalogue;

/** Adds or updates an entry in the in-memory catalogue. */
export const updateCatalogueCache = (entry: CatalogueEntry): void => {
  if (!inMemoryCatalogue) {
    inMemoryCatalogue = [entry];
    return;
  }
  const idx = inMemoryCatalogue.findIndex(
    (c) => c.id === entry.id || c.canonicalName.toLowerCase() === entry.canonicalName.toLowerCase(),
  );
  if (idx >= 0) {
    inMemoryCatalogue[idx] = entry;
  } else {
    inMemoryCatalogue.push(entry);
  }
};

/** Clear cache (useful in tests). */
export const clearCatalogueCache = (): void => {
  inMemoryCatalogue = null;
  warmPromise = null;
};
