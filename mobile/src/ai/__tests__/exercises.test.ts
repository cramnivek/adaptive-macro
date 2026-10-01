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
import { MUSCLE_REGIONS } from '../../components/muscleMap';

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

  it('throws EnrichmentParseError, not TypeError, for a null entry', () => {
    expect(() => parseEnrichment({ exercises: [null] }, ['Squat'])).toThrow(EnrichmentParseError);
  });

  // bodyweightBased as the string 'false' is the likeliest real model slip.
  it.each([
    ['canonicalName', undefined],
    ['primaryMuscle', undefined],
    ['equipment', undefined],
    ['instructions', undefined],
    ['instructions', ''],
    ['bodyweightBased', undefined],
    ['bodyweightBased', 'false'],
  ])('reports the name as missing when %s is %o', (field, value) => {
    const broken = { ...entry('Squat'), [field]: value };
    const result = parseEnrichment({ exercises: [broken] }, ['Squat']);
    expect(result.entries).toEqual([]);
    expect(result.missing).toEqual(['Squat']);
  });

  // The defect this replaced: one fluffed field failed all twenty names in the
  // batch, and the user was told all twenty "could not be read".
  it('keeps the good entries when one entry in the batch is incomplete', () => {
    const result = parseEnrichment(
      {
        exercises: [
          entry('Bench Press'),
          { ...entry('Squat'), instructions: '' },
          entry('Deadlift'),
        ],
      },
      ['Bench Press', 'Squat', 'Deadlift'],
    );
    expect(result.entries.map((e) => e.requestedName)).toEqual(['Bench Press', 'Deadlift']);
    expect(result.missing).toEqual(['Squat']);
  });
});

/**
 * Casing is the seam between a Hevy export and a model echoing a name back.
 * `Bench Press (Barbell)` returned as `Bench Press (barbell)` used to be
 * dropped, reported as unrecognised, and re-billed on every future run.
 */
describe('parseEnrichment and requested spelling', () => {
  it('matches the requested name whatever case the model echoes it in', () => {
    const result = parseEnrichment({ exercises: [entry('Bench Press (barbell)')] }, [
      'Bench Press (Barbell)',
    ]);
    expect(result.missing).toEqual([]);
    expect(result.entries).toHaveLength(1);
  });

  // `linkExerciseToCatalogue` runs an exact-match UPDATE on `exercises.name`,
  // so the entry has to carry the spelling that table holds, not the model's.
  it('emits the requested spelling, not the echoed one', () => {
    const result = parseEnrichment({ exercises: [entry('bench press (BARBELL)')] }, [
      'Bench Press (Barbell)',
    ]);
    expect(result.entries[0].requestedName).toBe('Bench Press (Barbell)');
  });

  it('ignores surrounding whitespace on the echoed name', () => {
    const result = parseEnrichment({ exercises: [entry('  Pull Up  ')] }, ['Pull Up']);
    expect(result.entries[0].requestedName).toBe('Pull Up');
    expect(result.missing).toEqual([]);
  });

  // Still nothing we asked about, so it must not become a catalogue row.
  it('still ignores a name that was never requested', () => {
    const result = parseEnrichment({ exercises: [entry('Leg Press')] }, ['Bench Press']);
    expect(result.entries).toEqual([]);
    expect(result.missing).toEqual(['Bench Press']);
  });
});

describe('parseEnrichment and the muscle map', () => {
  /** A response row, overridable per test. */
  const row = (extra: Record<string, unknown> = {}) => ({
    requestedName: 'Pull Up',
    canonicalName: 'Pull Up',
    movementPattern: 'pull',
    primaryMuscle: 'Lats',
    equipment: 'Pull-up bar',
    bodyweightBased: true,
    instructions: 'Hang from the bar and pull your chin over it.',
    primaryRegion: 'lats',
    secondaryRegions: ['biceps', 'upper_back'],
    steps: ['Grip the bar wider than your shoulders.', 'Pull until your chin clears it.'],
    ...extra,
  });

  const parseOne = (extra: Record<string, unknown> = {}) =>
    parseEnrichment({ exercises: [row(extra)] }, ['Pull Up']).entries[0];

  it('keeps the regions and steps the model returned', () => {
    const entry = parseOne();
    expect(entry.primaryRegion).toBe('lats');
    expect(entry.secondaryRegions).toEqual(['biceps', 'upper_back']);
    expect(entry.steps).toHaveLength(2);
  });

  it('falls back to full_body for a region it invented', () => {
    // "posterior chain" is a phrase a model reaches for and a diagram cannot use.
    expect(parseOne({ primaryRegion: 'posterior chain' }).primaryRegion).toBe('full_body');
  });

  it('keeps the entry when the regions are missing entirely', () => {
    // Unlike a missing name or equipment, this is not worth dropping an entry
    // over: the diagram has something to draw either way.
    const entry = parseOne({ primaryRegion: undefined, secondaryRegions: undefined });
    expect(entry).toBeDefined();
    expect(entry.primaryRegion).toBe('full_body');
    expect(entry.secondaryRegions).toEqual([]);
  });

  it('drops full_body from the secondary list, where it means nothing', () => {
    // Shading the whole body as a *secondary* muscle says only "and the rest".
    const entry = parseOne({ secondaryRegions: ['full_body', 'biceps', 'nonsense'] });
    expect(entry.secondaryRegions).toEqual(['biceps']);
  });

  it('keeps the entry when steps are missing, because the prose is the fallback', () => {
    const entry = parseOne({ steps: undefined });
    expect(entry.steps).toEqual([]);
    expect(entry.instructions).toContain('Hang from the bar');
  });

  it('drops a blank step rather than numbering an empty line', () => {
    expect(parseOne({ steps: ['Grip the bar.', '  ', 'Pull.'] }).steps).toEqual([
      'Grip the bar.',
      'Pull.',
    ]);
  });
});

describe('enrichmentPromptFor and the muscle map', () => {
  it('lists every region the model may choose from', () => {
    // An enum the prompt does not mention is one the model invents around.
    const prompt = enrichmentPromptFor(['Squat']);
    for (const region of MUSCLE_REGIONS) expect(prompt).toContain(region);
  });
});

describe('parseEnrichment and a messy secondary list', () => {
  const rowWith = (secondaryRegions: unknown) => ({
    requestedName: 'Pull Up',
    canonicalName: 'Pull Up',
    movementPattern: 'pull',
    primaryMuscle: 'Lats',
    equipment: 'Pull-up bar',
    bodyweightBased: true,
    instructions: 'Hang and pull.',
    primaryRegion: 'lats',
    secondaryRegions,
    steps: ['Hang.', 'Pull.'],
  });
  const secondaries = (value: unknown) =>
    parseEnrichment({ exercises: [rowWith(value)] }, ['Pull Up']).entries[0].secondaryRegions;

  it('drops the primary when the model repeats it as a secondary', () => {
    // "Lats, also lats and biceps" is an ordinary answer and reads as a bug.
    expect(secondaries(['lats', 'biceps'])).toEqual(['biceps']);
  });

  it('deduplicates, because two of the same shade darker than one', () => {
    // The figure draws each secondary at 35% opacity; two composite to ~58%
    // and the muscle reads almost as strongly as the primary.
    expect(secondaries(['biceps', 'biceps', 'forearms'])).toEqual(['biceps', 'forearms']);
  });

  it('still drops full_body and still tolerates nonsense', () => {
    expect(secondaries(['full_body', 'nonsense', 'traps'])).toEqual(['traps']);
  });
});
