import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHevyCsv } from '../hevy';
import { applyBodyweightOverrides, buildImportPlan } from '../importWorkouts';

const parsed = parseHevyCsv(
  readFileSync(join(__dirname, 'fixtures/hevy-sample.csv'), 'utf8'),
);

const allStarts = parsed.sessions.map((s) => s.startedAt);

describe('buildImportPlan', () => {
  it('plans every session when nothing is on record', () => {
    const plan = buildImportPlan(parsed, new Set());

    expect(plan.sessions).toHaveLength(8);
    expect(plan.duplicateSessions).toBe(0);
    expect(plan.setsToWrite).toBe(41);
  });

  // Idempotency: the import is re-runnable because the first attempt will be
  // wrong in some way, and a retry must not double the history.
  it('writes nothing when every session is already on record', () => {
    const plan = buildImportPlan(parsed, new Set(allStarts));

    expect(plan.sessions).toHaveLength(0);
    expect(plan.setsToWrite).toBe(0);
    expect(plan.duplicateSessions).toBe(8);
  });

  it('lands only the new sessions of a later export', () => {
    const alreadyHave = new Set(allStarts.slice(0, 6));
    const plan = buildImportPlan(parsed, alreadyHave);

    expect(plan.sessions.map((s) => s.startedAt)).toEqual(allStarts.slice(6));
    expect(plan.duplicateSessions).toBe(6);
  });

  it('reports each skip reason separately rather than as one number', () => {
    const plan = buildImportPlan(parsed, new Set());

    expect(plan.skipped.noReps).toBe(4);
    expect(plan.skipped.noWeightOnLoadedLift).toBe(5);
  });

  it('offers only exercises that appear in the sessions it will write', () => {
    const plan = buildImportPlan(parsed, new Set(allStarts.slice(0, 7)));
    const names = new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.name)));

    expect(plan.exercises.length).toBeGreaterThan(0);
    for (const exercise of plan.exercises) {
      expect(names.has(exercise.name)).toBe(true);
    }
  });

  // A conversion wrong by a factor is obvious to a person and invisible to a
  // test, so the preview shows one real converted value.
  it('carries a sample converted weight for the preview', () => {
    const plan = buildImportPlan(parsed, new Set());

    expect(plan.sampleWeight).not.toBeNull();
    expect(plan.sampleWeight?.kg).toBeGreaterThan(0);
    expect(plan.sampleWeight?.lbs).toBeCloseTo((plan.sampleWeight?.kg ?? 0) / 0.45359237, 1);
  });

  it('has no sample weight when there is nothing to write', () => {
    expect(buildImportPlan(parsed, new Set(allStarts)).sampleWeight).toBeNull();
  });
});

describe('applyBodyweightOverrides', () => {
  it('applies a correction the user made in the preview', () => {
    const plan = buildImportPlan(parsed, new Set());
    const input = applyBodyweightOverrides(plan, { 'Chest Dip (Weighted)': true });

    const dip = input
      .flatMap((s) => s.exercises)
      .find((e) => e.name === 'Chest Dip (Weighted)');

    expect(dip?.bodyweightBased).toBe(true);
  });

  it('leaves the inference alone where the user changed nothing', () => {
    const plan = buildImportPlan(parsed, new Set());
    const input = applyBodyweightOverrides(plan, {});

    const pull = input.flatMap((s) => s.exercises).find((e) => e.name === 'Wide Pull Up');
    const bench = input
      .flatMap((s) => s.exercises)
      .find((e) => e.name === 'Bench Press (Barbell)');

    expect(pull?.bodyweightBased).toBe(true);
    expect(bench?.bodyweightBased).toBe(false);
  });

  it('carries every set through unchanged', () => {
    const plan = buildImportPlan(parsed, new Set());
    const input = applyBodyweightOverrides(plan, {});
    const sets = input.reduce(
      (n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0),
      0,
    );

    expect(sets).toBe(plan.setsToWrite);
  });
});
