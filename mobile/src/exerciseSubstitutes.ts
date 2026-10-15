import type { MovementPattern } from './ai/exercises';
import { type CardioMode, detectCardio, detectCardioMode } from './cardio';
import type { CatalogueEntry } from './db';
import type { KnownExercise } from './exerciseSearch';

export interface SubstituteOption {
  id: string;
  name: string;
  canonicalName: string;
  pattern: MovementPattern | string;
  primaryMuscle?: string;
  equipment?: string;
  bodyweightBased: boolean;
  isCardio: boolean;
  cardioMode?: CardioMode | null;
  isHistory: boolean;
  matchTier: 'same-muscle-and-pattern' | 'same-pattern' | 'same-muscle';
  score: number;
}

export interface EquipmentGroup {
  equipment: string;
  label: string;
  substitutes: SubstituteOption[];
}

/**
 * Standard equipment category mapping for clean UI organization.
 */
export const normalizeEquipmentCategory = (rawEquipment?: string): string => {
  if (!rawEquipment) return 'Other';
  const norm = rawEquipment.toLowerCase();
  if (norm.includes('dumbbell') || norm.includes('db')) return 'Dumbbell';
  if (norm.includes('barbell') || norm.includes('bb')) return 'Barbell';
  if (norm.includes('machine') || norm.includes('smith')) return 'Machine';
  if (norm.includes('cable')) return 'Cable';
  if (norm.includes('bodyweight') || norm.includes('body weight')) return 'Bodyweight';
  if (norm.includes('kettlebell') || norm.includes('kb')) return 'Kettlebell';
  return 'Other';
};

/**
 * Finds intelligent substitute exercises matching movement pattern and primary muscle.
 */
export const findSubstitutes = ({
  currentExerciseName,
  catalogue,
  known,
  patterns = {},
  limit = 20,
}: {
  currentExerciseName: string;
  catalogue: CatalogueEntry[];
  known: KnownExercise[];
  patterns?: Record<string, MovementPattern>;
  limit?: number;
}): SubstituteOption[] => {
  const normCurrent = currentExerciseName.trim().toLowerCase();

  // 1. Resolve current exercise metadata
  const currentCat = catalogue.find(
    (c) =>
      c.canonicalName.toLowerCase() === normCurrent ||
      c.recordedName?.toLowerCase() === normCurrent,
  );
  const currentHistory = known.find((k) => k.name.toLowerCase() === normCurrent);

  const isCurrentCardio =
    currentHistory?.isCardio ?? (currentCat ? detectCardio(currentCat.canonicalName) : detectCardio(currentExerciseName));
  const currentPattern = (currentCat?.movementPattern ?? patterns[currentExerciseName] ?? 'isolation') as MovementPattern;
  const currentMuscle = currentCat?.primaryMuscle?.toLowerCase();

  const candidates: SubstituteOption[] = [];
  const seenNames = new Set<string>();

  // Helper to test & add a candidate
  const evaluateCandidate = (
    id: string,
    displayName: string,
    canonicalName: string,
    pattern: MovementPattern | string,
    primaryMuscle?: string,
    equipment?: string,
    bodyweightBased = false,
    isCardio = false,
    cardioMode: CardioMode | null = null,
    isHistory = false,
  ) => {
    const lower = displayName.toLowerCase();
    if (lower === normCurrent || seenNames.has(lower)) return;
    if (isCardio !== isCurrentCardio) return;

    const normCandidateMuscle = primaryMuscle?.toLowerCase();
    const isSamePattern = pattern === currentPattern && pattern !== 'isolation';
    const isSameMuscle = Boolean(
      currentMuscle &&
      normCandidateMuscle &&
      (currentMuscle.includes(normCandidateMuscle) || normCandidateMuscle.includes(currentMuscle)),
    );

    let matchTier: SubstituteOption['matchTier'] | null = null;
    let score = 0;

    if (isSamePattern && isSameMuscle) {
      matchTier = 'same-muscle-and-pattern';
      score = 300;
    } else if (isSamePattern) {
      matchTier = 'same-pattern';
      score = 200;
    } else if (isSameMuscle) {
      matchTier = 'same-muscle';
      score = 150;
    }

    // Include candidate if it matches pattern or muscle
    if (matchTier) {
      seenNames.add(lower);
      // History bonus: prefer exercises the user already performs
      if (isHistory) score += 50;

      candidates.push({
        id,
        name: displayName,
        canonicalName,
        pattern,
        primaryMuscle,
        equipment,
        bodyweightBased,
        isCardio,
        cardioMode,
        isHistory,
        matchTier,
        score,
      });
    }
  };

  // Process catalogue entries
  for (const entry of catalogue) {
    const displayName = entry.recordedName ?? entry.canonicalName;
    const historyItem = known.find(
      (k) =>
        k.name.toLowerCase() === displayName.toLowerCase() ||
        k.name.toLowerCase() === entry.canonicalName.toLowerCase(),
    );

    evaluateCandidate(
      entry.id,
      displayName,
      entry.canonicalName,
      entry.movementPattern,
      entry.primaryMuscle,
      entry.equipment,
      historyItem?.bodyweightBased ?? entry.bodyweightBased,
      historyItem?.isCardio ?? detectCardio(displayName),
      historyItem?.cardioMode ?? detectCardioMode(displayName),
      Boolean(historyItem),
    );
  }

  // Process known history exercises not in catalogue
  for (const item of known) {
    const lower = item.name.toLowerCase();
    if (seenNames.has(lower) || lower === normCurrent) continue;

    const pattern = patterns[item.name] ?? 'isolation';
    evaluateCandidate(
      `known:${item.name}`,
      item.name,
      item.name,
      pattern,
      undefined,
      undefined,
      item.bodyweightBased,
      item.isCardio ?? detectCardio(item.name),
      item.cardioMode ?? detectCardioMode(item.name),
      true,
    );
  }

  // Sort descending by score, tiebreak alphabetically
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return candidates.slice(0, limit);
};

/**
 * Groups substitutes by equipment category for quick tab/chip browsing.
 */
export const groupSubstitutesByEquipment = (
  substitutes: SubstituteOption[],
): EquipmentGroup[] => {
  const groupsMap = new Map<string, SubstituteOption[]>();

  for (const sub of substitutes) {
    const category = normalizeEquipmentCategory(sub.equipment);
    const existing = groupsMap.get(category);
    if (existing) {
      existing.push(sub);
    } else {
      groupsMap.set(category, [sub]);
    }
  }

  const preferredOrder = ['Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Barbell', 'Other'];
  const result: EquipmentGroup[] = [];

  for (const eq of preferredOrder) {
    const list = groupsMap.get(eq);
    if (list && list.length > 0) {
      result.push({ equipment: eq, label: eq, substitutes: list });
    }
  }

  // Any remaining categories
  for (const [eq, list] of groupsMap.entries()) {
    if (!preferredOrder.includes(eq) && list.length > 0) {
      result.push({ equipment: eq, label: eq, substitutes: list });
    }
  }

  return result;
};
