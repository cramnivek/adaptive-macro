import { enrichExercises } from './api/gemini';
import { type CatalogueEntry, catalogueEntryForExercise, upsertCatalogueEntry } from './db';

/**
 * The how-to for an exercise, cataloguing it first if nobody has yet.
 *
 * A routine that was just built is mostly exercises the app has never seen,
 * and "nothing is catalogued" is no answer to someone deciding whether to keep
 * one. Looked up again by the name the model returned, which need not be the
 * one asked for — the same reason the picker searches by it.
 */
export const exerciseInfoFor = async (name: string, geminiApiKey: string): Promise<CatalogueEntry | null> => {
  const known = await catalogueEntryForExercise(name);
  if (known) return known;

  const { entries } = await enrichExercises([name], geminiApiKey);
  if (entries.length === 0) return null;
  await upsertCatalogueEntry(entries[0]);
  return catalogueEntryForExercise(entries[0].canonicalName);
};
