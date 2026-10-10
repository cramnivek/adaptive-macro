import { z } from 'zod';

/**
 * Reading a training programme out of a document.
 *
 * Nobody exports a routine as JSON. Programmes arrive the way influencers and
 * coaches hand them out: a PDF, a screenshot of a spreadsheet, a photo of a
 * printed page. So the model reads the document and this module decides what
 * of its answer is allowed to become a routine. Kept pure, so every rule here
 * runs under the node test environment.
 */

/** What the model is asked to return. zod below is what is actually enforced. */
export const ROUTINE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    notProgram: { type: 'boolean' },
    routines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                sets: { type: 'number' },
                reps: { type: 'string' },
              },
              required: ['name', 'sets', 'reps'],
            },
          },
        },
        required: ['name', 'exercises'],
      },
    },
  },
  required: ['notProgram', 'routines'],
} as const;

export const ROUTINE_IMPORT_PROMPT = `You are reading a strength-training programme from a document a person uploaded.

Extract every distinct workout in it. A programme usually splits into days or
sessions — "Push / Pull / Legs", "Day 1: Upper", "Week A — Lower". Each of those
is one routine, named the way the document names it.

For each routine, list its exercises in the order they appear, with:
- name: the exercise as written, with abbreviations expanded ("DB" to Dumbbell,
  "BB" to Barbell, "OHP" to Overhead Press). Do not rename an exercise into a
  different one. A back-off, top or drop set of an exercise is that exercise:
  give it the same name, with no "(back-off)" or similar.
- sets: the number of working sets, as an integer. Count warm-up sets only if
  the document lists them as sets to do.
- reps: the rep target as written — "8", "8-10", "AMRAP", "30s". Empty string if
  the document gives none.

Only extract what is in the document. Never add an exercise it does not list.
If a week repeats the same days, extract each distinct day once.

If the document is not a training programme at all, set notProgram to true and
return no routines.`;

const ExerciseSchema = z.object({
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
});

export const RoutineImportSchema = z.object({
  notProgram: z.boolean(),
  routines: z.array(z.object({ name: z.string(), exercises: z.array(ExerciseSchema) })),
});

export type RoutineImport = z.infer<typeof RoutineImportSchema>;

export interface RoutineDraftExercise {
  name: string;
  sets: number;
  /** The target as the document wrote it, or null when it gave none. */
  reps: string | null;
}

export interface RoutineDraft {
  name: string;
  exercises: RoutineDraftExercise[];
}

/** A routine should not demand more working sets of one movement than this. */
const MAX_SETS = 10;
/** What a set count falls back to when the document's is unreadable. */
const DEFAULT_SETS = 3;

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();

const setsFrom = (value: number): number =>
  Number.isFinite(value) && value >= 1 ? Math.min(MAX_SETS, Math.round(value)) : DEFAULT_SETS;

/**
 * Turns the model's answer into routines that are safe to save.
 *
 * The rules are the ones the database or the screen would otherwise break on:
 *
 * - An exercise listed twice in one routine is merged, its sets added. The
 *   schema allows one row per exercise per routine, and the save upserts, so a
 *   duplicate would not fail — it would silently overwrite the first entry and
 *   lose its sets.
 * - Set counts are whole numbers between 1 and 10. A model reading "3-4" as 3.5
 *   or a scan as 40 should not produce a routine nobody can follow.
 * - A routine left with no exercises is dropped rather than saved empty.
 * - Two routines with the same name are told apart, because a list of three
 *   identical "Day 1"s is one nobody can choose from.
 */
export const toRoutineDrafts = (parsed: RoutineImport): RoutineDraft[] => {
  if (parsed.notProgram) return [];

  const drafts: RoutineDraft[] = [];
  const seenNames = new Map<string, number>();

  for (const [index, routine] of parsed.routines.entries()) {
    const merged: RoutineDraftExercise[] = [];

    for (const exercise of routine.exercises) {
      const name = tidy(exercise.name);
      if (name === '') continue;

      const sets = setsFrom(exercise.sets);
      const reps = tidy(exercise.reps).slice(0, 20) || null;
      const existing = merged.find((m) => m.name.toLowerCase() === name.toLowerCase());

      if (existing) {
        existing.sets = Math.min(MAX_SETS, existing.sets + sets);
        existing.reps ??= reps;
      } else {
        merged.push({ name, sets, reps });
      }
    }

    if (merged.length === 0) continue;

    const base = tidy(routine.name) || `Imported routine ${index + 1}`;
    const count = (seenNames.get(base.toLowerCase()) ?? 0) + 1;
    seenNames.set(base.toLowerCase(), count);

    drafts.push({ name: count === 1 ? base : `${base} (${count})`, exercises: merged });
  }

  return drafts;
};

/** Words that name the kit rather than the movement. */
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'kettlebell', 'band', 'ez', 'bar']);

/**
 * A name's words, without order, case, punctuation or a plural "s" — so
 * "Barbell Bench Press", "Bench Press (Barbell)" and "bench-press, barbell"
 * all come out the same.
 */
const wordsOf = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => (word.length >= 3 && word.endsWith('s') ? word.slice(0, -1) : word))
    .sort();

/**
 * The exercise already in the log that an imported name means, or null.
 *
 * Exercise names join history only when they match exactly, so a programme's
 * "Barbell Bench Press" saved as written would start a second, empty history
 * beside the user's "Bench Press (Barbell)" — no last weight, no load
 * suggestion, no milestones.
 *
 * Two names match when they share the same words in any order. Failing that,
 * an imported name that leaves out only the equipment — "Bench Press" — takes
 * the one logged exercise it could mean, and none if it could mean several,
 * because guessing barbell over dumbbell would be worse than a new name.
 */
export const matchKnownExercise = (name: string, known: string[]): string | null => {
  const words = wordsOf(name);
  if (words.length === 0) return null;
  const key = words.join(' ');

  const same = known.find((candidate) => wordsOf(candidate).join(' ') === key);
  if (same !== undefined) return same;

  const fillsInEquipment = known.filter((candidate) => {
    const theirs = wordsOf(candidate);
    const extra = [...theirs];
    for (const word of words) {
      const at = extra.indexOf(word);
      if (at === -1) return false;
      extra.splice(at, 1);
    }
    return extra.every((word) => EQUIPMENT.has(word));
  });
  return fillsInEquipment.length === 1 ? fillsInEquipment[0] : null;
};

export interface ResolvedExercise extends RoutineDraftExercise {
  /** What the document called it, when that is not the name it will be saved as. */
  importedAs: string | null;
  /** Whether the name is one already in the log, so its history carries on. */
  known: boolean;
}

/**
 * A draft with each exercise renamed to the logged one it means, where there
 * is one.
 *
 * Merges again afterwards: "Bench Press" and "Barbell Bench Press" are two
 * names in the document but one exercise in the log, and saving both would hit
 * the same overwrite `toRoutineDrafts` merges to avoid.
 */
export const resolveAgainstLog = (
  draft: RoutineDraft,
  known: string[],
): { name: string; exercises: ResolvedExercise[] } => {
  const exercises: ResolvedExercise[] = [];

  for (const exercise of draft.exercises) {
    const match = matchKnownExercise(exercise.name, known);
    const name = match ?? exercise.name;
    const existing = exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());

    if (existing) {
      existing.sets = Math.min(MAX_SETS, existing.sets + exercise.sets);
      existing.reps ??= exercise.reps;
    } else {
      exercises.push({
        name,
        sets: exercise.sets,
        reps: exercise.reps,
        importedAs: match !== null && match !== exercise.name ? exercise.name : null,
        known: match !== null,
      });
    }
  }

  return { name: draft.name, exercises };
};
