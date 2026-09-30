import { describe, expect, it } from 'vitest';
import {
  BATCH_SIZE,
  EnrichmentParseError,
  MOVEMENT_PATTERNS,
  batchNames,
  enrichmentPromptFor,
  normalisePattern,
  parseEnrichment,
} from '../exercises';

const entry = (name: string, pattern = 'push') => ({
  requestedName: name,
  canonicalName: name,
  movementPattern: pattern,
  primaryMuscle: 'chest',
  equipment: 'barbell',
  bodyweightBased: false,
  instructions: 'Lie on the bench. Lower the bar to your chest. Press it back up.',
});

describe('batchNames', () => {
  it('splits 41 names into 20, 20 and 1', () => {
    const names = Array.from({ length: 41 }, (_, i) => `Exercise ${i}`);
    const batches = batchNames(names);
    expect(batches.map((b) => b.length)).toEqual([20, 20, 1]);
    expect(batches.flat()).toEqual(names);
  });

  it('returns nothing for an empty list rather than one empty batch', () => {
    expect(batchNames([])).toEqual([]);
  });

  it('puts a single name in a single batch', () => {
    expect(batchNames(['Squat'])).toEqual([['Squat']]);
  });

  it('uses a batch size of 20', () => {
    expect(BATCH_SIZE).toBe(20);
  });
});

describe('normalisePattern', () => {
  it.each(MOVEMENT_PATTERNS)('passes %s through unchanged', (pattern) => {
    expect(normalisePattern(pattern)).toBe(pattern);
  });

  // The pattern drives icon selection, so an unrecognised value must land
  // somewhere honest rather than crash or render nothing.
  it.each([['sprint'], [''], [null], [undefined], [42], [{}]])(
    'falls back to isolation for %o',
    (raw) => {
      expect(normalisePattern(raw)).toBe('isolation');
    },
  );
});

describe('enrichmentPromptFor', () => {
  it('names every exercise it was given', () => {
    const prompt = enrichmentPromptFor(['Barbell Squat', 'Pull Up']);
    expect(prompt).toContain('Barbell Squat');
    expect(prompt).toContain('Pull Up');
  });

  it('lists the movement patterns the model may choose from', () => {
    const prompt = enrichmentPromptFor(['Squat']);
    for (const pattern of MOVEMENT_PATTERNS) expect(prompt).toContain(pattern);
  });
});

describe('parseEnrichment', () => {
  it('maps a well-formed response to entries', () => {
    const result = parseEnrichment({ exercises: [entry('Bench Press')] }, ['Bench Press']);
    expect(result.missing).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].canonicalName).toBe('Bench Press');
    expect(result.entries[0].movementPattern).toBe('push');
    expect(result.entries[0].bodyweightBased).toBe(false);
  });

  it('normalises an unrecognised pattern rather than rejecting the entry', () => {
    const result = parseEnrichment({ exercises: [entry('Farmer Carry', 'strongman')] }, [
      'Farmer Carry',
    ]);
    expect(result.entries[0].movementPattern).toBe('isolation');
  });

  // Silence here would mean an exercise stays unlinked with no explanation.
  it('names the exercises the model did not return', () => {
    const result = parseEnrichment({ exercises: [entry('Bench Press')] }, [
      'Bench Press',
      'Deadlift',
      'Pull Up',
    ]);
    expect(result.missing).toEqual(['Deadlift', 'Pull Up']);
    expect(result.entries).toHaveLength(1);
  });

  it('ignores an entry for a name it never asked about', () => {
    const result = parseEnrichment({ exercises: [entry('Bench Press'), entry('Leg Press')] }, [
      'Bench Press',
    ]);
    expect(result.entries.map((e) => e.requestedName)).toEqual(['Bench Press']);
  });

  it.each([[null], [undefined], [{}], [{ exercises: 'no' }], ['a string']])(
    'throws rather than writing partial data for %o',
    (raw) => {
      expect(() => parseEnrichment(raw, ['Squat'])).toThrow(EnrichmentParseError);
    },
  );

  it('throws when an entry is missing a required field', () => {
    const broken = { ...entry('Squat'), instructions: undefined };
    expect(() => parseEnrichment({ exercises: [broken] }, ['Squat'])).toThrow(
      EnrichmentParseError,
    );
  });
});
