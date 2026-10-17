import type { MovementPattern } from './ai/exercises';
import {
  BUILTIN_ALIASES_BY_CANONICAL,
  exerciseIdentityKey,
  findBuiltinByIdentity,
  findBuiltinCatalogueEntry,
} from './builtinCatalogue';
import { type CardioMode, detectCardio, detectCardioMode } from './cardio';
import type { MuscleRegion } from './components/muscleMap';
import type { CatalogueEntry } from './db';

export type MuscleFilter = 'all' | 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core';

/**
 * Curated priority order of foundational gym exercises shown first when a
 * new user opens the exercise picker with no workout history.
 */
const STARTER_PRIORITY_NAMES: string[] = [
  'bench press (barbell)',
  'squat (barbell)',
  'lat pulldown (cable)',
  'overhead press (barbell)',
  'romanian deadlift (barbell)',
  'incline bench press (dumbbell)',
  'seated cable row',
  'leg press',
  'lateral raise (dumbbell)',
  'deadlift (barbell)',
  'pull-up',
  'dumbbell row',
  'bicep curl (dumbbell)',
  'triceps pushdown',
  'bulgarian split squat',
  'seated leg curl (machine)',
  'leg extension (machine)',
  'face pull (cable)',
  'hip thrust (barbell)',
  'plank',
];

const STARTER_PRIORITY_INDEX = new Map<string, number>(
  STARTER_PRIORITY_NAMES.map((name, idx) => [name, idx]),
);

export const matchesMuscleFilter = (
  entry: {
    primaryMuscle?: string;
    primaryRegion?: MuscleRegion | null;
    secondaryRegions?: MuscleRegion[];
  },
  filter: MuscleFilter,
): boolean => {
  if (filter === 'all') return true;
  const region = entry.primaryRegion;
  const muscle = (entry.primaryMuscle ?? '').toLowerCase();

  switch (filter) {
    case 'chest':
      return region === 'chest' || /chest|pec/.test(muscle);
    case 'back':
      return (
        region === 'lats' ||
        region === 'upper_back' ||
        region === 'lower_back' ||
        region === 'traps' ||
        /back|lat|trap/.test(muscle)
      );
    case 'legs':
      return (
        region === 'quads' ||
        region === 'hamstrings' ||
        region === 'glutes' ||
        region === 'calves' ||
        /quad|hamstring|glute|calf|calves|leg/.test(muscle)
      );
    case 'shoulders':
      return region === 'shoulders' || /shoulder|delt/.test(muscle);
    case 'arms':
      return (
        region === 'biceps' ||
        region === 'triceps' ||
        region === 'forearms' ||
        /bicep|tricep|forearm|arm/.test(muscle)
      );
    case 'core':
      return region === 'abs' || region === 'obliques' || /core|ab|oblique/.test(muscle);
    default:
      return true;
  }
};

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
  cgbp: [['close'], ['grip'], ['bench'], ['press']],
  rfess: [['split'], ['squat']],
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

interface PreparedString {
  lower: string;
  words: string[];
  acronym: string;
}

const preparedStringCache = new Map<string, PreparedString>();

const prepareString = (text: string): PreparedString => {
  let cached = preparedStringCache.get(text);
  if (cached) return cached;
  const lower = text.toLowerCase();
  const words = tokenize(text);
  const acronym = words.map((w) => w[0]).join('');
  cached = { lower, words, acronym };
  if (preparedStringCache.size < 4000) {
    preparedStringCache.set(text, cached);
  }
  return cached;
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

const scoreSingleTarget = (
  trimmedQuery: string,
  expandedTokenGroups: string[][],
  name: string,
  canonicalName: string,
  normMuscle: string,
  normEquipment: string,
  isHistory = false,
): number => {
  const prepName = prepareString(name);
  const prepCanonical =
    canonicalName === name ? prepName : prepareString(canonicalName);

  const normName = prepName.lower;
  const normCanonical = prepCanonical.lower;

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
  if (
    trimmedQuery.length >= 2 &&
    (prepName.acronym.includes(trimmedQuery) ||
      prepCanonical.acronym.includes(trimmedQuery))
  ) {
    acronymBonus = 350;
  }

  // 4. Token group matching (every token group must have at least one token match)
  let tokenScore = 0;
  const nameWords = prepName.words;
  const canonicalWords = prepCanonical.words;

  for (const group of expandedTokenGroups) {
    let groupMatched = false;
    let groupBestScore = 0;

    for (const token of group) {
      // Word prefix match in name (e.g. token "bench" matches "Bench" or "Benchpress")
      let wordPrefixMatch = false;
      for (let i = 0; i < nameWords.length; i++) {
        if (nameWords[i].startsWith(token)) {
          wordPrefixMatch = true;
          break;
        }
      }
      if (!wordPrefixMatch && prepCanonical !== prepName) {
        for (let i = 0; i < canonicalWords.length; i++) {
          if (canonicalWords[i].startsWith(token)) {
            wordPrefixMatch = true;
            break;
          }
        }
      }
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
      if (normEquipment && normEquipment.includes(token)) {
        groupMatched = true;
        groupBestScore = Math.max(groupBestScore, 45);
        continue;
      }

      // Muscle match (e.g. "chest", "biceps", "quads")
      if (normMuscle && normMuscle.includes(token)) {
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
 * Calculates a search score for a candidate against a query, including any
 * built-in aliases for the canonical exercise.
 * Returns 0 if candidate does not match all query token groups.
 */
export const scoreCandidate = (
  query: string,
  _queryTokens: string[],
  expandedTokenGroups: string[][],
  name: string,
  canonicalName: string,
  primaryMuscle?: string,
  equipment?: string,
  isHistory = false,
): number => {
  const trimmedQuery = query.trim().toLowerCase();
  const normMuscle = (primaryMuscle ?? '').toLowerCase();
  const normEquipment = (equipment ?? '').toLowerCase();

  let best = scoreSingleTarget(
    trimmedQuery,
    expandedTokenGroups,
    name,
    canonicalName,
    normMuscle,
    normEquipment,
    isHistory,
  );

  const aliases = BUILTIN_ALIASES_BY_CANONICAL[canonicalName.toLowerCase()];
  if (aliases && best < 1000) {
    for (let i = 0; i < aliases.length; i++) {
      const aliasScore = scoreSingleTarget(
        trimmedQuery,
        expandedTokenGroups,
        aliases[i],
        canonicalName,
        normMuscle,
        normEquipment,
        isHistory,
      );
      if (aliasScore > best) {
        best = aliasScore;
      }
    }
  }

  return best;
};

/**
 * Searches and ranks exercises from catalogue and history with zero duplicates.
 */
export const searchExercisesFast = ({
  query,
  catalogue,
  known,
  isCardio = false,
  muscleFilter = 'all',
  limit = 30,
}: {
  query: string;
  catalogue: CatalogueEntry[];
  known: KnownExercise[];
  isCardio?: boolean;
  muscleFilter?: MuscleFilter;
  limit?: number;
}): ExerciseSearchResult[] => {
  const trimmed = query.trim();

  // Build O(1) lookup of user history by canonical exercise identity (first/most-logged wins)
  const knownByIdentity = new Map<string, KnownExercise>();
  for (let i = 0; i < known.length; i++) {
    const item = known[i];
    const idKey = exerciseIdentityKey(item.name);
    if (!knownByIdentity.has(idKey)) {
      knownByIdentity.set(idKey, item);
    }
  }

  // --- Empty query: Return top suggestions ---
  if (!trimmed) {
    const results: ExerciseSearchResult[] = [];
    const seenIdentity = new Set<string>();
    const seenNames = new Set<string>();
    const seenCanonical = new Set<string>();

    if (isCardio) {
      // Cardio mode empty query: user cardio history first
      for (const item of known) {
        if (item.isCardio) {
          const idKey = exerciseIdentityKey(item.name);
          const lower = item.name.toLowerCase();
          if (seenIdentity.has(idKey) || seenNames.has(lower)) continue;
          seenIdentity.add(idKey);
          seenNames.add(lower);
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

    // Build O(1) lookup of catalogue entries by identity for empty-query enrichment
    const catalogueByIdentity = new Map<string, CatalogueEntry>();
    for (let i = 0; i < catalogue.length; i++) {
      const c = catalogue[i];
      const idKey = exerciseIdentityKey(c.recordedName ?? c.canonicalName, c.canonicalName);
      if (!catalogueByIdentity.has(idKey)) {
        catalogueByIdentity.set(idKey, c);
      }
    }

    // Strength mode empty query:
    // 1. Check user history first (filtered by muscleFilter if active)
    for (const item of known) {
      if (item.isCardio) continue;
      const lower = item.name.toLowerCase();
      const idKey = exerciseIdentityKey(item.name);
      if (seenIdentity.has(idKey) || seenNames.has(lower)) continue;

      const catEntry =
        catalogueByIdentity.get(idKey) ??
        findBuiltinByIdentity(item.name) ??
        findBuiltinCatalogueEntry(item.name);

      if (
        muscleFilter !== 'all' &&
        !matchesMuscleFilter(
          {
            primaryMuscle: catEntry?.primaryMuscle,
            primaryRegion: catEntry?.primaryRegion,
            secondaryRegions: catEntry?.secondaryRegions,
          },
          muscleFilter,
        )
      ) {
        continue;
      }

      seenIdentity.add(idKey);
      seenNames.add(lower);
      if (catEntry) {
        seenCanonical.add(catEntry.canonicalName.toLowerCase());
      }

      const strictBuiltin = findBuiltinByIdentity(item.name);
      const resolvedCanonical =
        catalogueByIdentity.get(idKey)?.canonicalName ??
        strictBuiltin?.canonicalName ??
        item.name;

      results.push({
        id: catalogueByIdentity.get(idKey)?.id ?? strictBuiltin?.id ?? `known:${item.name}`,
        name: item.name,
        canonicalName: resolvedCanonical,
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

      if (muscleFilter === 'all' && results.length >= 10) break;
    }

    // If user has history and no specific muscle filter is selected, return their frequent history
    if (muscleFilter === 'all' && results.length > 0) {
      return results;
    }

    // 2. Otherwise (new user with no history, OR browsing a specific muscle filter),
    // populate from the built-in/cached catalogue.
    const catalogueCandidates: CatalogueEntry[] = [];
    for (const entry of catalogue) {
      const effectiveName = entry.recordedName ?? entry.canonicalName;
      if (detectCardio(effectiveName)) continue;
      const idKey = exerciseIdentityKey(effectiveName, entry.canonicalName);
      if (
        seenIdentity.has(idKey) ||
        seenNames.has(effectiveName.toLowerCase()) ||
        seenCanonical.has(entry.canonicalName.toLowerCase())
      ) {
        continue;
      }
      if (!matchesMuscleFilter(entry, muscleFilter)) {
        continue;
      }
      seenIdentity.add(idKey);
      catalogueCandidates.push(entry);
    }

    // Sort starter exercises by curated foundational priority first, then alphabetically
    catalogueCandidates.sort((a, b) => {
      const idxA = STARTER_PRIORITY_INDEX.get(a.canonicalName.toLowerCase()) ?? 999;
      const idxB = STARTER_PRIORITY_INDEX.get(b.canonicalName.toLowerCase()) ?? 999;
      if (idxA !== idxB) return idxA - idxB;
      return (a.recordedName ?? a.canonicalName).localeCompare(
        b.recordedName ?? b.canonicalName,
      );
    });

    for (const entry of catalogueCandidates) {
      if (results.length >= limit) break;
      const effectiveName = entry.recordedName ?? entry.canonicalName;
      seenNames.add(effectiveName.toLowerCase());
      seenCanonical.add(entry.canonicalName.toLowerCase());
      results.push({
        id: entry.id,
        name: effectiveName,
        canonicalName: entry.canonicalName,
        recordedName: entry.recordedName,
        movementPattern: entry.movementPattern,
        primaryMuscle: entry.primaryMuscle,
        equipment: entry.equipment,
        bodyweightBased: entry.bodyweightBased,
        isCardio: false,
        cardioMode: null,
        isHistory: false,
        score: 50,
      });
    }

    return results.slice(0, limit);
  }

  // --- Active search query ---
  const queryTokens = tokenize(trimmed);
  const expandedGroups = expandQueryTokens(queryTokens);

  const candidates: ExerciseSearchResult[] = [];
  const seenIdentity = new Set<string>();
  const seenCanonical = new Set<string>();
  const seenNames = new Set<string>();

  // 1. Process catalogue entries (merging matching user history in O(1))
  for (let i = 0; i < catalogue.length; i++) {
    const entry = catalogue[i];
    const idKey = exerciseIdentityKey(
      entry.recordedName ?? entry.canonicalName,
      entry.canonicalName,
    );
    if (
      seenIdentity.has(idKey) ||
      seenCanonical.has(entry.canonicalName.toLowerCase())
    ) {
      continue;
    }

    const historyItem = knownByIdentity.get(idKey);
    const effectiveName =
      entry.recordedName ?? historyItem?.name ?? entry.canonicalName;
    if (seenNames.has(effectiveName.toLowerCase())) {
      continue;
    }

    const isEntryCardio = historyItem?.isCardio ?? detectCardio(effectiveName);
    if (isCardio !== isEntryCardio) {
      continue;
    }

    if (!isCardio && muscleFilter !== 'all' && !matchesMuscleFilter(entry, muscleFilter)) {
      continue;
    }

    // Mark identity as processed so Loop 2 never re-emits the same exercise from `known`
    seenIdentity.add(idKey);
    seenCanonical.add(entry.canonicalName.toLowerCase());
    seenNames.add(effectiveName.toLowerCase());

    const builtinCanon =
      findBuiltinByIdentity(entry.canonicalName)?.canonicalName ?? entry.canonicalName;

    const score = scoreCandidate(
      trimmed,
      queryTokens,
      expandedGroups,
      effectiveName,
      builtinCanon,
      entry.primaryMuscle,
      entry.equipment,
      Boolean(historyItem),
    );

    if (score > 0) {
      candidates.push({
        id: entry.id,
        name: effectiveName,
        canonicalName: entry.canonicalName,
        recordedName: entry.recordedName ?? historyItem?.name ?? null,
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
  for (let i = 0; i < known.length; i++) {
    const item = known[i];
    const lowerName = item.name.toLowerCase();
    const idKey = exerciseIdentityKey(item.name);
    if (
      seenIdentity.has(idKey) ||
      seenNames.has(lowerName) ||
      seenCanonical.has(lowerName)
    ) {
      continue;
    }

    const itemIsCardio = item.isCardio ?? detectCardio(item.name);
    if (isCardio !== itemIsCardio) {
      continue;
    }

    const strictBuiltin = findBuiltinByIdentity(item.name);
    const fallbackBuiltin = strictBuiltin ?? findBuiltinCatalogueEntry(item.name);
    if (
      !isCardio &&
      muscleFilter !== 'all' &&
      !matchesMuscleFilter(
        {
          primaryMuscle: fallbackBuiltin?.primaryMuscle,
          primaryRegion: fallbackBuiltin?.primaryRegion,
          secondaryRegions: fallbackBuiltin?.secondaryRegions,
        },
        muscleFilter,
      )
    ) {
      continue;
    }

    seenIdentity.add(idKey);
    seenNames.add(lowerName);

    const resolvedCanonical = strictBuiltin?.canonicalName ?? item.name;
    const score = scoreCandidate(
      trimmed,
      queryTokens,
      expandedGroups,
      item.name,
      resolvedCanonical,
      fallbackBuiltin?.primaryMuscle,
      fallbackBuiltin?.equipment,
      true,
    );

    if (score > 0) {
      candidates.push({
        id: strictBuiltin?.id ?? `known:${item.name}`,
        name: item.name,
        canonicalName: resolvedCanonical,
        recordedName: item.name,
        movementPattern: fallbackBuiltin?.movementPattern,
        primaryMuscle: fallbackBuiltin?.primaryMuscle,
        equipment: fallbackBuiltin?.equipment,
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
  loadOrEntries: (() => Promise<CatalogueEntry[]>) | CatalogueEntry[],
): Promise<CatalogueEntry[]> => {
  if (Array.isArray(loadOrEntries)) {
    inMemoryCatalogue = loadOrEntries;
    return inMemoryCatalogue;
  }
  if (inMemoryCatalogue) return inMemoryCatalogue;
  if (warmPromise) return warmPromise;

  warmPromise = loadOrEntries()
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

/** Adds or updates an entry in the in-memory catalogue, deduplicating by identity. */
export const updateCatalogueCache = (entry: CatalogueEntry): void => {
  if (!inMemoryCatalogue) {
    inMemoryCatalogue = [entry];
    return;
  }
  const entryIdentity = exerciseIdentityKey(
    entry.recordedName ?? entry.canonicalName,
    entry.canonicalName,
  );
  const idx = inMemoryCatalogue.findIndex(
    (c) =>
      c.id === entry.id ||
      c.canonicalName.toLowerCase() === entry.canonicalName.toLowerCase() ||
      exerciseIdentityKey(c.recordedName ?? c.canonicalName, c.canonicalName) ===
        entryIdentity,
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
