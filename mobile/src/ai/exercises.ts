/**
 * Turning an exercise name into a known thing.
 *
 * Pure by design: prompt construction and response parsing live here so they
 * can be tested under node, while the network call sits in `src/api/gemini.ts`.
 * The same split `importWorkouts.ts` has from `runImport.ts`, for the same
 * reason — `mobile/vitest.config.ts` runs `environment: 'node'`, where
 * anything reaching react-native fails to run rather than merely to fail.
 *
 * Unlike a food lookup this needs no grounding. A food's macros are published
 * figures and an ungrounded answer is a fabrication, which is why `lookupFood`
 * costs two calls and treats a missing grounding chunk as failure. Which muscle
 * a press loads is general knowledge, so this is one structured call.
 */

/** The patterns an icon exists for. Anything else is normalised into `isolation`. */
export const MOVEMENT_PATTERNS = [
  'push',
  'pull',
  'squat',
  'hinge',
  'lunge',
  'carry',
  'core',
  'isolation',
] as const;

export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export interface EnrichedExercise {
  /** The name as it exists in `exercises.name`. Never rewritten; used to link. */
  requestedName: string;
  canonicalName: string;
  movementPattern: MovementPattern;
  primaryMuscle: string;
  equipment: string;
  bodyweightBased: boolean;
  instructions: string;
}

/**
 * Names per call.
 *
 * One call per exercise would cost a Hevy history of eighty lifts eighty calls.
 * Twenty at a time makes that four.
 */
export const BATCH_SIZE = 20;

export class EnrichmentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrichmentParseError';
  }
}

export const batchNames = (names: string[], size: number = BATCH_SIZE): string[][] => {
  const batches: string[][] = [];
  for (let i = 0; i < names.length; i += size) batches.push(names.slice(i, i + size));
  return batches;
};

export const normalisePattern = (raw: unknown): MovementPattern =>
  typeof raw === 'string' && (MOVEMENT_PATTERNS as readonly string[]).includes(raw)
    ? (raw as MovementPattern)
    : 'isolation';

export const enrichmentPromptFor = (names: string[]): string =>
  [
    'You are cataloguing strength-training exercises.',
    'For each name below, return its canonical name, its movement pattern, the primary muscle it loads, the equipment it needs, whether it is loaded by bodyweight, and brief instructions for performing it.',
    `The movement pattern must be exactly one of: ${MOVEMENT_PATTERNS.join(', ')}.`,
    'Instructions should be two to four short sentences covering setup, the movement itself, and the one cue that most often goes wrong. Do not number them.',
    'Keep the canonical name close to the name given — do not merge a machine or variation into its barbell parent, because they load differently and are tracked separately.',
    'Return one entry per name given, using the name exactly as given in requestedName.',
    '',
    'Names:',
    ...names.map((name) => `- ${name}`),
  ].join('\n');

export const ENRICHMENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requestedName: { type: 'string' },
          canonicalName: { type: 'string' },
          movementPattern: { type: 'string', enum: [...MOVEMENT_PATTERNS] },
          primaryMuscle: { type: 'string' },
          equipment: { type: 'string' },
          bodyweightBased: { type: 'boolean' },
          instructions: { type: 'string' },
        },
        required: [
          'requestedName',
          'canonicalName',
          'movementPattern',
          'primaryMuscle',
          'equipment',
          'bodyweightBased',
          'instructions',
        ],
      },
    },
  },
  required: ['exercises'],
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

export const parseEnrichment = (
  raw: unknown,
  requested: string[],
): { entries: EnrichedExercise[]; missing: string[] } => {
  const list = (raw as { exercises?: unknown })?.exercises;
  if (!Array.isArray(list)) {
    throw new EnrichmentParseError('Enrichment response had no exercises array');
  }

  const wanted = new Set(requested);
  const entries: EnrichedExercise[] = [];

  for (const item of list) {
    if (typeof item !== 'object' || item === null) {
      throw new EnrichmentParseError('Enrichment response contained a non-object entry');
    }
    const row = item as Record<string, unknown>;
    // An entry for something we never asked about tells us nothing and would
    // create a catalogue row no exercise links to.
    if (!isNonEmptyString(row.requestedName) || !wanted.has(row.requestedName)) continue;

    if (
      !isNonEmptyString(row.canonicalName) ||
      !isNonEmptyString(row.primaryMuscle) ||
      !isNonEmptyString(row.equipment) ||
      !isNonEmptyString(row.instructions) ||
      typeof row.bodyweightBased !== 'boolean'
    ) {
      throw new EnrichmentParseError(`Enrichment entry for ${row.requestedName} was incomplete`);
    }

    entries.push({
      requestedName: row.requestedName,
      canonicalName: row.canonicalName,
      movementPattern: normalisePattern(row.movementPattern),
      primaryMuscle: row.primaryMuscle,
      equipment: row.equipment,
      bodyweightBased: row.bodyweightBased,
      instructions: row.instructions,
    });
  }

  const returned = new Set(entries.map((e) => e.requestedName));
  return { entries, missing: requested.filter((name) => !returned.has(name)) };
};
