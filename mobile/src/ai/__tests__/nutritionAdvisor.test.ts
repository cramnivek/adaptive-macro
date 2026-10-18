import { describe, expect, it, vi } from 'vitest';
import { runLocalNutritionDiagnostics } from '../nutritionAdvisor';
import type { LogEntry, Nutrients, UserProfile, Goal } from '@adaptive-macros/engine';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

describe('Nutrition Advisor & Diagnostics', () => {
  const profile: UserProfile = {
    sex: 'male',
    age: 28,
    heightCm: 180,
  };

  const goal: Goal = {
    direction: 'lose',
    rateKgPerWeek: 0.5,
  };

  it('evaluates optimal protein distribution across multiple meals', () => {
    const consumed: Nutrients = {
      kcal: 2100,
      proteinG: 150,
      carbsG: 220,
      fatG: 65,
      fiberG: 35,
    };

    const entries: LogEntry[] = [
      {
        id: '1',
        date: '2026-10-18',
        foodId: 'f1',
        foodName: 'Whey & Oats',
        grams: 100,
        meal: 'breakfast',
        nutrients: { kcal: 450, proteinG: 35, carbsG: 50, fatG: 8 },
      },
      {
        id: '2',
        date: '2026-10-18',
        foodId: 'f2',
        foodName: 'Chicken & Sweet Potato',
        grams: 300,
        meal: 'lunch',
        nutrients: { kcal: 650, proteinG: 45, carbsG: 65, fatG: 12 },
      },
      {
        id: '3',
        date: '2026-10-18',
        foodId: 'f3',
        foodName: 'Salmon & Broccoli',
        grams: 350,
        meal: 'dinner',
        nutrients: { kcal: 700, proteinG: 40, carbsG: 30, fatG: 25 },
      },
      {
        id: '4',
        date: '2026-10-18',
        foodId: 'f4',
        foodName: 'Greek Yogurt',
        grams: 200,
        meal: 'snack',
        nutrients: { kcal: 300, proteinG: 30, carbsG: 15, fatG: 5 },
      },
    ];

    const diag = runLocalNutritionDiagnostics({ consumed, entries, profile, goal });
    expect(diag.proteinTimingAdvice).toContain('leucine threshold');
    expect(diag.proteinTimingAdvice).toContain('4 separate meals');
  });

  it('warns when high protein is concentrated in only one meal', () => {
    const consumed: Nutrients = {
      kcal: 2000,
      proteinG: 130,
      carbsG: 200,
      fatG: 60,
    };

    const entries: LogEntry[] = [
      {
        id: '1',
        date: '2026-10-18',
        foodId: 'f1',
        foodName: 'Steak Feast',
        grams: 500,
        meal: 'dinner',
        nutrients: { kcal: 1200, proteinG: 110, carbsG: 20, fatG: 40 },
      },
    ];

    const diag = runLocalNutritionDiagnostics({ consumed, entries, profile, goal });
    expect(diag.proteinTimingAdvice).toContain('single meal');
  });

  it('diagnoses electrolyte imbalance and surfaces sodium/potassium ratio', () => {
    const consumed: Nutrients = {
      kcal: 2200,
      proteinG: 150,
      carbsG: 220,
      fatG: 70,
      micros: {
        sodiumMg: 4200,
        potassiumMg: 1400,
      },
    };

    const diag = runLocalNutritionDiagnostics({ consumed, entries: [], profile, goal });
    expect(diag.electrolytes.ratio).toBe(3);
    expect(diag.electrolytes.isOptimalRatio).toBe(false);
    expect(diag.electrolytes.advice).toContain('elevated');
  });

  it('flags top clinical micronutrient deficiencies', () => {
    const consumed: Nutrients = {
      kcal: 2000,
      proteinG: 140,
      carbsG: 200,
      fatG: 65,
      micros: {
        ironMg: 2, // low for male (target 8)
        magnesiumMg: 100, // low for male (target 420)
        vitaminCMg: 10, // low for male (target 90)
        potassiumMg: 800, // low for male (target 3400)
      },
    };

    const diag = runLocalNutritionDiagnostics({ consumed, entries: [], profile, goal });
    expect(diag.topGaps.length).toBeGreaterThanOrEqual(3);
    const gapNames = diag.topGaps.map((g) => g.target.name);
    expect(gapNames).toContain('Potassium');
    expect(gapNames).toContain('Magnesium');
  });
});
