import { describe, expect, it } from 'vitest';
import {
  EMPTY_NUTRIENTS,
  isNutritionallyConsistent,
  kcalFromMacros,
  remainingAgainst,
  scaleNutrients,
  sumNutrients,
} from '../src/foods';
import { kgToLb, lbToKg, roundTo } from '../src/units';
import { addDays, diffDays, eachDay, isValidISODate, todayISO } from '../src/dates';

const oats = { kcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.5, fiberG: 10.1 };

describe('scaleNutrients', () => {
  it('scales from the per-100g basis', () => {
    const portion = scaleNutrients(oats, 40);
    expect(portion.kcal).toBeCloseTo(151.6, 6);
    expect(portion.proteinG).toBeCloseTo(5.28, 6);
  });

  it('returns zeros for a zero portion', () => {
    expect(scaleNutrients(oats, 0)).toEqual({ ...EMPTY_NUTRIENTS });
  });
});

describe('sumNutrients', () => {
  it('adds a day of entries', () => {
    const total = sumNutrients([scaleNutrients(oats, 100), scaleNutrients(oats, 50)]);
    expect(total.kcal).toBeCloseTo(379 * 1.5, 6);
  });

  it('treats an empty diary as zero, not NaN', () => {
    expect(sumNutrients([])).toEqual(EMPTY_NUTRIENTS);
  });
});

describe('remainingAgainst', () => {
  it('goes negative when the target is exceeded', () => {
    const remaining = remainingAgainst(
      { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
      { kcal: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
    );
    expect(remaining.kcal).toBe(-200);
    expect(remaining.proteinG).toBe(30);
  });
});

describe('isNutritionallyConsistent', () => {
  it('accepts an entry whose macros match its calories', () => {
    expect(isNutritionallyConsistent(oats)).toBe(true);
  });

  it('flags an entry whose calorie field contradicts its macros', () => {
    expect(isNutritionallyConsistent({ ...oats, kcal: 120 })).toBe(false);
  });

  it('computes implied calories with Atwater factors', () => {
    expect(kcalFromMacros({ kcal: 0, proteinG: 10, carbsG: 20, fatG: 5 })).toBe(165);
  });
});

describe('units', () => {
  it('round-trips kg and lb', () => {
    expect(roundTo(kgToLb(lbToKg(185)), 6)).toBe(185);
    expect(lbToKg(220.46226218487757)).toBeCloseTo(100, 9);
  });
});

describe('dates', () => {
  it('adds and diffs days without DST drift', () => {
    expect(addDays('2026-03-07', 3)).toBe('2026-03-10');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-01-01', '2026-03-01')).toBe(59);
    expect(diffDays('2026-03-01', '2026-01-01')).toBe(-59);
  });

  it('enumerates an inclusive range', () => {
    expect(eachDay('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
    expect(eachDay('2026-02-02', '2026-01-30')).toEqual([]);
  });

  it('reports today as a local calendar day', () => {
    expect(isValidISODate(todayISO())).toBe(true);
    expect(todayISO(new Date(2026, 8, 17, 23, 30))).toBe('2026-09-17');
  });

  it('rejects malformed dates', () => {
    expect(isValidISODate('2026-1-1')).toBe(false);
    expect(isValidISODate('not-a-date')).toBe(false);
  });
});
