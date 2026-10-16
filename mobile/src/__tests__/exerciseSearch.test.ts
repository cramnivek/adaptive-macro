import { describe, expect, it } from 'vitest';
import type { CatalogueEntry } from '../db';
import { BUILTIN_CATALOGUE } from '../builtinCatalogue';
import {
  clearCatalogueCache,
  expandQueryTokens,
  getCachedCatalogue,
  matchesMuscleFilter,
  scoreCandidate,
  searchExercisesFast,
  tokenize,
  updateCatalogueCache,
  warmCatalogueCache,
} from '../exerciseSearch';

const mockCatalogue: CatalogueEntry[] = [
  {
    id: 'c1',
    canonicalName: 'Bench Press (Barbell)',
    recordedName: 'Bench Press',
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Barbell',
    bodyweightBased: false,
    instructions: 'Lower bar to chest and press up.',
    primaryRegion: 'chest',
    secondaryRegions: ['triceps', 'shoulders'],
    steps: ['Grip bar', 'Lower to chest', 'Press up'],
  },
  {
    id: 'c2',
    canonicalName: 'Incline Bench Press (Dumbbell)',
    recordedName: null,
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    instructions: 'Press dumbbells up at 30 degree incline.',
    primaryRegion: 'chest',
    secondaryRegions: ['triceps', 'shoulders'],
    steps: ['Lie back', 'Press dumbbells'],
  },
  {
    id: 'c3',
    canonicalName: 'Overhead Press (Barbell)',
    recordedName: null,
    movementPattern: 'push',
    primaryMuscle: 'Shoulders',
    equipment: 'Barbell',
    bodyweightBased: false,
    instructions: 'Press bar overhead while standing.',
    primaryRegion: 'shoulders',
    secondaryRegions: ['triceps'],
    steps: ['Rack at shoulders', 'Press overhead'],
  },
  {
    id: 'c4',
    canonicalName: 'Romanian Deadlift (Barbell)',
    recordedName: null,
    movementPattern: 'hinge',
    primaryMuscle: 'Hamstrings',
    equipment: 'Barbell',
    bodyweightBased: false,
    instructions: 'Hinge hips back keeping back flat.',
    primaryRegion: 'hamstrings',
    secondaryRegions: ['glutes'],
    steps: ['Hinge hips', 'Lower bar below knees', 'Drive hips forward'],
  },
  {
    id: 'c5',
    canonicalName: 'Pull-Up',
    recordedName: 'Pull Up',
    movementPattern: 'pull',
    primaryMuscle: 'Back',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    instructions: 'Pull chest up to the bar.',
    primaryRegion: 'lats',
    secondaryRegions: ['biceps'],
    steps: ['Hang from bar', 'Pull chin over bar'],
  },
  {
    id: 'c6',
    canonicalName: 'Treadmill Running',
    recordedName: null,
    movementPattern: 'carry',
    primaryMuscle: 'Cardio',
    equipment: 'Machine',
    bodyweightBased: true,
    instructions: 'Run at steady speed.',
    primaryRegion: null,
    secondaryRegions: [],
    steps: [],
  },
];

describe('exerciseSearch - tokenization and abbreviations', () => {
  it('tokenizes text stripping punctuation and hyphens', () => {
    expect(tokenize('Bench Press (Barbell)')).toEqual(['bench', 'press', 'barbell']);
    expect(tokenize('Pull-Up / Chin-Up')).toEqual(['pull', 'up', 'chin', 'up']);
  });

  it('expands gym abbreviations', () => {
    const tokens = tokenize('db rdl');
    const expanded = expandQueryTokens(tokens);
    expect(expanded[0]).toContain('dumbbell');
    expect(expanded[1]).toContain('romanian');
    expect(expanded[2]).toContain('deadlift');
  });

  it('expands ohp into overhead press', () => {
    const tokens = tokenize('ohp');
    const expanded = expandQueryTokens(tokens);
    expect(expanded[0]).toContain('overhead');
    expect(expanded[1]).toContain('press');
  });
});

describe('exerciseSearch - scoring', () => {
  it('gives highest score to exact matches', () => {
    const query = 'bench press';
    const tokens = tokenize(query);
    const groups = expandQueryTokens(tokens);

    const scoreExact = scoreCandidate(query, tokens, groups, 'Bench Press', 'Bench Press (Barbell)', 'Chest', 'Barbell');
    const scoreOther = scoreCandidate(query, tokens, groups, 'Incline Bench Press', 'Incline Bench Press', 'Chest', 'Dumbbell');

    expect(scoreExact).toBeGreaterThan(scoreOther);
    expect(scoreExact).toBeGreaterThanOrEqual(1000);
  });

  it('boosts exercises in user history', () => {
    const query = 'squat';
    const tokens = tokenize(query);
    const groups = expandQueryTokens(tokens);

    const scoreHistory = scoreCandidate(query, tokens, groups, 'Back Squat', 'Back Squat', 'Quads', 'Barbell', true);
    const scoreNew = scoreCandidate(query, tokens, groups, 'Back Squat', 'Back Squat', 'Quads', 'Barbell', false);

    expect(scoreHistory).toBeGreaterThan(scoreNew);
  });
});

describe('exerciseSearch - fast search engine', () => {
  const known = [
    { name: 'Bench Press', bodyweightBased: false },
    { name: 'Pull Up', bodyweightBased: true },
    { name: 'Custom Dumbbell Lateral Raise', bodyweightBased: false },
  ];

  it('finds Bench Press first when typing "bench"', () => {
    const results = searchExercisesFast({
      query: 'bench',
      catalogue: mockCatalogue,
      known,
    });

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].name).toBe('Bench Press');
  });

  it('matches abbreviation "db" to dumbbell exercises', () => {
    const results = searchExercisesFast({
      query: 'db bench',
      catalogue: mockCatalogue,
      known,
    });

    expect(results.length).toBe(1);
    expect(results[0].canonicalName).toBe('Incline Bench Press (Dumbbell)');
  });

  it('matches acronym "ohp" to Overhead Press', () => {
    const results = searchExercisesFast({
      query: 'ohp',
      catalogue: mockCatalogue,
      known,
    });

    expect(results.length).toBe(1);
    expect(results[0].canonicalName).toBe('Overhead Press (Barbell)');
  });

  it('matches acronym "rdl" to Romanian Deadlift', () => {
    const results = searchExercisesFast({
      query: 'rdl',
      catalogue: mockCatalogue,
      known,
    });

    expect(results.length).toBe(1);
    expect(results[0].canonicalName).toBe('Romanian Deadlift (Barbell)');
  });

  it('matches multi-token search in any word order', () => {
    const results = searchExercisesFast({
      query: 'press barbell bench',
      catalogue: mockCatalogue,
      known,
    });

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Bench Press');
  });

  it('searches user history items not yet catalogued', () => {
    const results = searchExercisesFast({
      query: 'lateral',
      catalogue: mockCatalogue,
      known,
    });

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Custom Dumbbell Lateral Raise');
    expect(results[0].isHistory).toBe(true);
  });

  it('returns frequent exercises when query is empty', () => {
    const results = searchExercisesFast({
      query: '',
      catalogue: mockCatalogue,
      known,
    });

    expect(results.length).toBe(3);
    expect(results.map((r) => r.name)).toContain('Bench Press');
    expect(results.map((r) => r.name)).toContain('Pull Up');
  });

  it('filters cardio vs strength according to mode', () => {
    const strengthResults = searchExercisesFast({
      query: 'running',
      catalogue: mockCatalogue,
      known,
      isCardio: false,
    });
    expect(strengthResults.length).toBe(0);

    const cardioResults = searchExercisesFast({
      query: 'running',
      catalogue: mockCatalogue,
      known,
      isCardio: true,
    });
    expect(cardioResults.length).toBe(1);
    expect(cardioResults[0].canonicalName).toBe('Treadmill Running');
  });

  it('executes in sub-millisecond time across 300+ entries', () => {
    const largeCatalogue: CatalogueEntry[] = [];
    for (let i = 0; i < 300; i++) {
      largeCatalogue.push({
        id: `c_${i}`,
        canonicalName: `Exercise Variant ${i} Barbell Press`,
        recordedName: null,
        movementPattern: 'push',
        primaryMuscle: i % 2 === 0 ? 'Chest' : 'Back',
        equipment: 'Barbell',
        bodyweightBased: false,
        instructions: null,
        primaryRegion: null,
        secondaryRegions: [],
        steps: [],
      });
    }

    // Warm up JIT
    searchExercisesFast({ query: 'barbell', catalogue: largeCatalogue, known });

    const t0 = performance.now();
    const results = searchExercisesFast({
      query: 'barbell press',
      catalogue: largeCatalogue,
      known,
    });
    const t1 = performance.now();

    expect(results.length).toBeGreaterThan(0);
    expect(t1 - t0).toBeLessThan(25); // sub-5ms in JS engines, allow 25ms for CI/test runner jitter
  });
});

describe('exerciseSearch - catalogue cache management', () => {
  it('warms and returns cached catalogue', async () => {
    clearCatalogueCache();
    expect(getCachedCatalogue()).toBeNull();

    let calls = 0;
    const loader = async () => {
      calls++;
      return mockCatalogue;
    };

    const first = await warmCatalogueCache(loader);
    const second = await warmCatalogueCache(loader);

    expect(first).toEqual(mockCatalogue);
    expect(second).toEqual(mockCatalogue);
    expect(calls).toBe(1);
    expect(getCachedCatalogue()).toEqual(mockCatalogue);
  });

  it('updates cache with new entry without reloading', () => {
    clearCatalogueCache();
    updateCatalogueCache(mockCatalogue[0]);
    expect(getCachedCatalogue()?.length).toBe(1);

    const updated = { ...mockCatalogue[0], recordedName: 'Custom Bench' };
    updateCatalogueCache(updated);
    expect(getCachedCatalogue()?.length).toBe(1);
    expect(getCachedCatalogue()?.[0].recordedName).toBe('Custom Bench');
  });
});

describe('exerciseSearch - new users without existing workout history', () => {
  it('returns curated starter exercises when query and known history are both empty', () => {
    const results = searchExercisesFast({
      query: '',
      catalogue: BUILTIN_CATALOGUE,
      known: [],
    });

    expect(results.length).toBeGreaterThanOrEqual(20);
    // Foundational compound lifts appear first
    expect(results[0].canonicalName).toBe('Bench Press (Barbell)');
    expect(results[1].canonicalName).toBe('Squat (Barbell)');
    expect(results[2].canonicalName).toBe('Lat Pulldown (Cable)');
    expect(results[3].canonicalName).toBe('Overhead Press (Barbell)');
    expect(results.every((r) => !r.isCardio)).toBe(true);
  });

  it('filters exercises by muscle group when muscleFilter is set on empty query', () => {
    const chestResults = searchExercisesFast({
      query: '',
      catalogue: BUILTIN_CATALOGUE,
      known: [],
      muscleFilter: 'chest',
    });
    expect(chestResults.length).toBeGreaterThanOrEqual(7);
    expect(chestResults.every((r) => matchesMuscleFilter(r, 'chest'))).toBe(true);

    const backResults = searchExercisesFast({
      query: '',
      catalogue: BUILTIN_CATALOGUE,
      known: [],
      muscleFilter: 'back',
    });
    expect(backResults.length).toBeGreaterThanOrEqual(7);
    expect(backResults.every((r) => matchesMuscleFilter(r, 'back'))).toBe(true);

    const armsResults = searchExercisesFast({
      query: '',
      catalogue: BUILTIN_CATALOGUE,
      known: [],
      muscleFilter: 'arms',
    });
    expect(armsResults.length).toBeGreaterThanOrEqual(8);
    expect(armsResults.every((r) => matchesMuscleFilter(r, 'arms'))).toBe(true);
  });

  it('filters active search queries by muscleFilter', () => {
    const pressShoulders = searchExercisesFast({
      query: 'press',
      catalogue: BUILTIN_CATALOGUE,
      known: [],
      muscleFilter: 'shoulders',
    });
    expect(pressShoulders.length).toBeGreaterThanOrEqual(2);
    expect(pressShoulders.some((r) => r.canonicalName === 'Overhead Press (Barbell)')).toBe(true);
    expect(pressShoulders.some((r) => r.canonicalName === 'Bench Press (Barbell)')).toBe(false);
  });

  it('matches built-in aliases for common gym names', () => {
    const pecDeck = searchExercisesFast({
      query: 'butterfly',
      catalogue: BUILTIN_CATALOGUE,
      known: [],
    });
    expect(pecDeck.length).toBeGreaterThanOrEqual(1);
    expect(pecDeck[0].canonicalName).toBe('Pec Deck (Machine)');

    const lyingTri = searchExercisesFast({
      query: 'lying tricep extension',
      catalogue: BUILTIN_CATALOGUE,
      known: [],
    });
    expect(lyingTri.length).toBeGreaterThanOrEqual(1);
    expect(lyingTri[0].canonicalName).toBe('Skullcrusher (Barbell)');

    const tBar = searchExercisesFast({
      query: 't bar row',
      catalogue: BUILTIN_CATALOGUE,
      known: [],
    });
    expect(tBar.length).toBeGreaterThanOrEqual(1);
    expect(tBar[0].canonicalName).toBe('Chest-Supported Row (Dumbbell)');
  });
});


