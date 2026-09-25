import { kgToLb } from '@adaptive-macros/engine';
import type { WorkoutSessionInput } from '../db';
import type { HevyParseResult, ParsedExercise, ParsedSession } from './hevy';

/**
 * Turning a parsed export into what will actually be written.
 *
 * The decision half lives here and is pure, so it is tested against the
 * checked-in fixture; `runImport.ts` holds the two functions that touch the
 * database, which cannot be imported under node. That split is the same one
 * `mobile/vitest.config.ts` already draws.
 * Nothing is written until the user accepts the preview, matching how the meal
 * estimate and LookupCandidateSheet handle anything inferred.
 */

export interface ImportPlan {
  /** Sessions not already on record, in chronological order. */
  sessions: ParsedSession[];
  duplicateSessions: number;
  setsToWrite: number;
  /**
   * Exercises appearing in the sessions above, with the inferred bodyweight
   * flag. This is the judgement most likely to be wrong, so the preview shows
   * it and lets the user correct it before anything is written.
   */
  exercises: ParsedExercise[];
  /**
   * One real converted weight. A conversion wrong by a factor is obvious to a
   * person reading a number they recognise, and invisible to a test asserting
   * that some conversion happened.
   */
  sampleWeight: { exerciseName: string; lbs: number; kg: number } | null;
  dateRange: { first: string; last: string } | null;
  skipped: HevyParseResult['skipped'];
  droppedColumns: readonly string[];
}

export const buildImportPlan = (
  parsed: HevyParseResult,
  existingStartTimes: ReadonlySet<string>,
): ImportPlan => {
  const sessions = parsed.sessions.filter((s) => !existingStartTimes.has(s.startedAt));

  const names = new Set(sessions.flatMap((s) => s.exercises.map((e) => e.name)));
  const exercises = parsed.exercises.filter((e) => names.has(e.name));

  const setsToWrite = sessions.reduce(
    (total, s) => total + s.exercises.reduce((n, e) => n + e.sets.length, 0),
    0,
  );

  // The first set carrying a weight, so the sample is a number the user can
  // recognise rather than a blank.
  let sampleWeight: ImportPlan['sampleWeight'] = null;
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => s.weightKg !== null);
      if (set?.weightKg != null) {
        sampleWeight = {
          exerciseName: exercise.name,
          lbs: kgToLb(set.weightKg),
          kg: set.weightKg,
        };
        break;
      }
    }
    if (sampleWeight) break;
  }

  return {
    sessions,
    duplicateSessions: parsed.sessions.length - sessions.length,
    setsToWrite,
    exercises,
    sampleWeight,
    dateRange: sessions.length
      ? { first: sessions[0].date, last: sessions[sessions.length - 1].date }
      : null,
    skipped: parsed.skipped,
    droppedColumns: parsed.droppedColumns,
  };
};

/**
 * Folds the preview's corrections into what will be written.
 *
 * Kept separate from `buildImportPlan` so the plan can be shown, edited and
 * re-shown without being rebuilt, and so this stays a pure transformation that
 * a test can check set-for-set.
 */
export const applyBodyweightOverrides = (
  plan: ImportPlan,
  overrides: Record<string, boolean>,
): WorkoutSessionInput[] => {
  const inferred = new Map(plan.exercises.map((e) => [e.name, e.bodyweightBased]));

  return plan.sessions.map((session) => ({
    title: session.title,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    date: session.date,
    exercises: session.exercises.map((exercise) => ({
      name: exercise.name,
      bodyweightBased: overrides[exercise.name] ?? inferred.get(exercise.name) ?? false,
      sets: exercise.sets,
    })),
  }));
};
