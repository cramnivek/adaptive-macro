import { insertWorkoutSessions, knownSessionStarts } from '../db';
import { parseHevyCsv } from './hevy';
import { applyBodyweightOverrides, buildImportPlan } from './importWorkouts';
import type { ImportPlan } from './importWorkouts';

/**
 * The two steps that touch the database.
 *
 * Separated from `importWorkouts.ts` because importing `../db` pulls in
 * expo-sqlite, which has no node driver — so a test importing it cannot run at
 * all. Keeping the decisions on the other side of this line is what lets them
 * be tested.
 */

/** Parses a file's contents and plans it against what is already stored. */
export const planImport = async (csv: string): Promise<ImportPlan> =>
  buildImportPlan(parseHevyCsv(csv), await knownSessionStarts());

/** Writes an accepted plan. Nothing before this point touches the database. */
export const commitImport = async (
  plan: ImportPlan,
  overrides: Record<string, boolean>,
): Promise<{ sessions: number; sets: number }> =>
  insertWorkoutSessions(applyBodyweightOverrides(plan, overrides));
