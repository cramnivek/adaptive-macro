import { enrichExercises } from './api/gemini';
import {
  type CatalogueEntry,
  catalogueEntryForExercise,
  linkExerciseToCatalogue,
  upsertCatalogueEntry,
} from './db';

/**
 * The how-to for an exercise, cataloguing it first if nobody has yet.
 *
 * A routine that was just built is mostly exercises the app has never seen,
 * and "nothing is catalogued" is no answer to someone deciding whether to keep
 * one. Looked up again by the name the model returned, which need not be the
 * one asked for — the same reason the picker searches by it.
 */
export const exerciseInfoFor = async (
  name: string,
  geminiApiKey: string,
): Promise<CatalogueEntry | null> => {
  const known = await catalogueEntryForExercise(name);
  if (known) return known;

  try {
    const { entries } = await enrichExercises([name], geminiApiKey);
    if (entries.length > 0) {
      const id = await upsertCatalogueEntry(entries[0]);
      await linkExerciseToCatalogue(name, id);
      const saved =
        (await catalogueEntryForExercise(name)) ??
        (await catalogueEntryForExercise(entries[0].canonicalName));
      if (saved) return saved;
    }
  } catch {
    // Offline or proxy unavailable: fall back to a synthesized entry so the
    // ExerciseInfoSheet still opens and renders any matching MovementFigure.
  }

  return {
    id: `fallback:${name}`,
    canonicalName: name,
    recordedName: name,
    movementPattern: 'isolation',
    primaryMuscle: 'General',
    equipment: /\bdumbbell\b/i.test(name)
      ? 'Dumbbell'
      : /\bbarbell\b/i.test(name)
        ? 'Barbell'
        : /\bcable\b/i.test(name)
          ? 'Cable'
          : /\bmachine\b/i.test(name)
            ? 'Machine'
            : 'Bodyweight',
    bodyweightBased: false,
    instructions: 'Control the eccentric phase, maintain stable posture through the full range of motion, and drive smoothly through the concentric phase.',
    primaryRegion: null,
    secondaryRegions: [],
    steps: [
      'Set your starting position with a stable base and neutral spine.',
      'Control the lowering (eccentric) phase for 2–3 seconds through a comfortable range of motion.',
      'Drive smoothly back to the starting position while maintaining tension on the target muscle.',
    ],
  };
};
