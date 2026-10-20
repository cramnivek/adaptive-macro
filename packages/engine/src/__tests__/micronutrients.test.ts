import { describe, expect, it } from 'vitest';
import {
  addMicros,
  analyzeMicronutrients,
  computeNutritionQualityScore,
  evaluateElectrolytes,
  getClinicalRda,
  scaleMicros,
} from '../micronutrients.ts';
import type { Micronutrients, Nutrients } from '../types.ts';

describe('Clinical Micronutrient Engine', () => {
  it('provides comprehensive RDAs for both biological sexes', () => {
    const maleRda = getClinicalRda('male');
    const femaleRda = getClinicalRda('female');

    expect(maleRda.ironMg.rda).toBe(8);
    expect(femaleRda.ironMg.rda).toBe(18);

    expect(maleRda.potassiumMg.rda).toBe(3400);
    expect(femaleRda.potassiumMg.rda).toBe(2600);

    expect(maleRda.vitaminCMg.rda).toBe(90);
    expect(femaleRda.vitaminCMg.rda).toBe(75);
  });

  it('accurately scales micronutrients by portion size', () => {
    const micros: Micronutrients = {
      sodiumMg: 500,
      potassiumMg: 350,
      vitaminCMg: 20,
      saturatedFatG: 2.5,
    };

    // 200g portion (2x)
    const scaled = scaleMicros(micros, 2);
    expect(scaled?.sodiumMg).toBe(1000);
    expect(scaled?.potassiumMg).toBe(700);
    expect(scaled?.vitaminCMg).toBe(40);
    expect(scaled?.saturatedFatG).toBe(5);

    // 50g portion (0.5x)
    const half = scaleMicros(micros, 0.5);
    expect(half?.sodiumMg).toBe(250);
    expect(half?.potassiumMg).toBe(175);
    expect(half?.vitaminCMg).toBe(10);
    expect(half?.saturatedFatG).toBe(1.25);
  });

  it('sums micronutrients across multiple meal items correctly', () => {
    const item1: Micronutrients = {
      sodiumMg: 400,
      potassiumMg: 500,
      calciumMg: 150,
      vitaminCMg: 30,
    };
    const item2: Micronutrients = {
      sodiumMg: 200,
      potassiumMg: 300,
      magnesiumMg: 80,
      vitaminCMg: 15,
    };

    const combined = addMicros(item1, item2);
    expect(combined?.sodiumMg).toBe(600);
    expect(combined?.potassiumMg).toBe(800);
    expect(combined?.calciumMg).toBe(150);
    expect(combined?.magnesiumMg).toBe(80);
    expect(combined?.vitaminCMg).toBe(45);
  });

  it('evaluates electrolyte balance and alerts on skewed sodium/potassium ratios', () => {
    // Skewed high sodium, low potassium
    const highSodium = evaluateElectrolytes({
      sodiumMg: 3500,
      potassiumMg: 1400,
    });
    expect(highSodium.ratio).toBe(2.5);
    expect(highSodium.isOptimalRatio).toBe(false);
    expect(highSodium.advice).toContain('elevated');

    // Optimal 1:1 or higher potassium
    const balanced = evaluateElectrolytes({
      sodiumMg: 2200,
      potassiumMg: 3300,
    });
    expect(balanced.ratio).toBe(0.67);
    expect(balanced.isOptimalRatio).toBe(true);
    expect(balanced.advice).toContain('ideal');
  });

  it('computes comprehensive nutrition quality score from macros, fiber, electrolytes and micros', () => {
    const healthyDiet: Nutrients = {
      kcal: 2200,
      proteinG: 160,
      carbsG: 220,
      fatG: 70,
      fiberG: 38,
      micros: {
        sodiumMg: 2100,
        potassiumMg: 3500,
        magnesiumMg: 420,
        calciumMg: 1000,
        ironMg: 15,
        zincMg: 12,
        vitaminCMg: 95,
        vitaminDIU: 800,
        saturatedFatG: 15,
        transFatG: 0,
        addedSugarG: 15,
      },
    };

    const result = computeNutritionQualityScore(healthyDiet, 'male');
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.grade).toBe('Elite');
    expect(result.highlights.some((h) => h.includes('fiber goal'))).toBe(true);
  });

  it('analyzes clinical deficiency status across all tracked vitamins and minerals', () => {
    const micros: Micronutrients = {
      ironMg: 2, // very low compared to 18mg for female
      vitaminCMg: 80, // adequate for female (75mg)
    };

    const analyses = analyzeMicronutrients(micros, 'female');
    const iron = analyses.find((a) => a.key === 'ironMg');
    const vitC = analyses.find((a) => a.key === 'vitaminCMg');

    expect(iron?.status).toBe('deficient');
    expect(iron?.pctOfRda).toBe(11);

    expect(vitC?.status).toBe('optimal');
    expect(vitC?.pctOfRda).toBe(107);
  });
});

describe('getClinicalRda by age, against the DRI tables', () => {
  it('uses the adult figures to age 50 and the older ones after', () => {
    expect(getClinicalRda('male', 30).pyridoxineB6Mg.rda).toBe(1.3);
    expect(getClinicalRda('male', 60).pyridoxineB6Mg.rda).toBe(1.7);
    expect(getClinicalRda('female', 30).ironMg.rda).toBe(18);
    expect(getClinicalRda('female', 55).ironMg.rda).toBe(8);
    expect(getClinicalRda('female', 55).calciumMg.rda).toBe(1200);
    expect(getClinicalRda('male', 55).calciumMg.rda).toBe(1000);
    expect(getClinicalRda('male', 75).calciumMg.rda).toBe(1200);
  });

  it('gives 600 IU of vitamin D to age 70 and 800 after', () => {
    expect(getClinicalRda('female', 40).vitaminDIU.rda).toBe(600);
    expect(getClinicalRda('female', 75).vitaminDIU.rda).toBe(800);
  });

  it('does not hold food to limits that are about supplements', () => {
    const rda = getClinicalRda('male', 35);
    expect(rda.magnesiumMg.upperLimit).toBeUndefined();
    expect(rda.niacinB3Mg.upperLimit).toBeUndefined();
    expect(rda.folateB9Mcg.upperLimit).toBeUndefined();
    expect(rda.vitaminAMcg.upperLimit).toBeUndefined();
    // So a man eating his 420 mg of magnesium is not "high".
    const [magnesium] = analyzeMicronutrients({ magnesiumMg: 430 }, 'male', 35).filter((a) => a.key === 'magnesiumMg');
    expect(magnesium?.status).not.toBe('high');
  });

  it('takes the sodium target from the adequate intake, with 2,300 as the limit', () => {
    expect(getClinicalRda('male').sodiumMg.rda).toBe(1500);
    expect(getClinicalRda('male').sodiumMg.upperLimit).toBe(2300);
  });
});
