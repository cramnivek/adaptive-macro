import { describe, expect, it } from 'vitest';
import type { CatalogueEntry } from '../db';
import {
  findSubstitutes,
  groupSubstitutesByEquipment,
  normalizeEquipmentCategory,
} from '../exerciseSubstitutes';

const mockCatalogue: CatalogueEntry[] = [
  {
    id: 'c1',
    canonicalName: 'Bench Press (Barbell)',
    recordedName: 'Bench Press',
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Barbell',
    bodyweightBased: false,
    instructions: null,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps'],
    steps: [],
  },
  {
    id: 'c2',
    canonicalName: 'Dumbbell Bench Press',
    recordedName: null,
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Dumbbell',
    bodyweightBased: false,
    instructions: null,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps'],
    steps: [],
  },
  {
    id: 'c3',
    canonicalName: 'Chest Press Machine',
    recordedName: null,
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Machine',
    bodyweightBased: false,
    instructions: null,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps'],
    steps: [],
  },
  {
    id: 'c4',
    canonicalName: 'Overhead Press (Barbell)',
    recordedName: null,
    movementPattern: 'push',
    primaryMuscle: 'Shoulders',
    equipment: 'Barbell',
    bodyweightBased: false,
    instructions: null,
    primaryRegion: 'shoulders',
    secondaryRegions: ['triceps'],
    steps: [],
  },
  {
    id: 'c5',
    canonicalName: 'Barbell Row',
    recordedName: null,
    movementPattern: 'pull',
    primaryMuscle: 'Back',
    equipment: 'Barbell',
    bodyweightBased: false,
    instructions: null,
    primaryRegion: 'lats',
    secondaryRegions: ['biceps'],
    steps: [],
  },
  {
    id: 'c6',
    canonicalName: 'Push-Up',
    recordedName: null,
    movementPattern: 'push',
    primaryMuscle: 'Chest',
    equipment: 'Bodyweight',
    bodyweightBased: true,
    instructions: null,
    primaryRegion: 'chest',
    secondaryRegions: ['triceps'],
    steps: [],
  },
];

describe('exerciseSubstitutes - normalizeEquipmentCategory', () => {
  it('maps various equipment names into standard categories', () => {
    expect(normalizeEquipmentCategory('Dumbbell (Pairs)')).toBe('Dumbbell');
    expect(normalizeEquipmentCategory('Barbell with 20kg bar')).toBe('Barbell');
    expect(normalizeEquipmentCategory('Smith Machine')).toBe('Machine');
    expect(normalizeEquipmentCategory('Cable crossover')).toBe('Cable');
    expect(normalizeEquipmentCategory('Bodyweight only')).toBe('Bodyweight');
    expect(normalizeEquipmentCategory('Kettlebell')).toBe('Kettlebell');
    expect(normalizeEquipmentCategory('Resistance band')).toBe('Other');
  });
});

describe('exerciseSubstitutes - findSubstitutes', () => {
  it('finds substitutes matching same movement pattern and muscle first', () => {
    const substitutes = findSubstitutes({
      currentExerciseName: 'Bench Press',
      catalogue: mockCatalogue,
      known: [],
    });

    expect(substitutes.length).toBeGreaterThan(0);
    // Should not include current exercise
    expect(substitutes.some((s) => s.name === 'Bench Press')).toBe(false);

    // Top results should be same-muscle-and-pattern (Dumbbell Bench Press, Chest Press Machine, Push-Up)
    expect(substitutes[0].matchTier).toBe('same-muscle-and-pattern');
    const names = substitutes.map((s) => s.canonicalName);
    expect(names).toContain('Dumbbell Bench Press');
    expect(names).toContain('Chest Press Machine');
    expect(names).toContain('Push-Up');

    // Should include Overhead Press as same-pattern tier
    const ohp = substitutes.find((s) => s.canonicalName.includes('Overhead Press'));
    expect(ohp).toBeDefined();
    expect(ohp?.matchTier).toBe('same-pattern');

    // Should NOT include Barbell Row (pull vs push)
    expect(names).not.toContain('Barbell Row');
  });

  it('boosts exercises from user history', () => {
    const known = [
      { name: 'Push-Up', bodyweightBased: true },
    ];

    const substitutes = findSubstitutes({
      currentExerciseName: 'Bench Press',
      catalogue: mockCatalogue,
      known,
    });

    const pushUp = substitutes.find((s) => s.canonicalName === 'Push-Up');
    expect(pushUp?.isHistory).toBe(true);
    expect(pushUp?.score).toBeGreaterThan(300); // 300 tier + 50 history bonus
  });

  it('groups substitutes by equipment category cleanly', () => {
    const substitutes = findSubstitutes({
      currentExerciseName: 'Bench Press',
      catalogue: mockCatalogue,
      known: [],
    });

    const grouped = groupSubstitutesByEquipment(substitutes);
    expect(grouped.length).toBeGreaterThanOrEqual(2);

    const dumbbellGroup = grouped.find((g) => g.equipment === 'Dumbbell');
    expect(dumbbellGroup).toBeDefined();
    expect(dumbbellGroup?.substitutes[0].canonicalName).toBe('Dumbbell Bench Press');

    const machineGroup = grouped.find((g) => g.equipment === 'Machine');
    expect(machineGroup).toBeDefined();
    expect(machineGroup?.substitutes[0].canonicalName).toBe('Chest Press Machine');

    const bwGroup = grouped.find((g) => g.equipment === 'Bodyweight');
    expect(bwGroup).toBeDefined();
    expect(bwGroup?.substitutes[0].canonicalName).toBe('Push-Up');
  });
});
