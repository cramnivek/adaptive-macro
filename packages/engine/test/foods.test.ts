import { describe, expect, it } from 'vitest';
import {
  EMPTY_NUTRIENTS,
  isNutritionallyConsistent,
  kcalFromMacros,
  per100gFromPortion,
  remainingAgainst,
  byQueryCoverage,
  queryCoverage,
  resultsAnswerQuery,
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

/**
 * Restaurant food is published per portion ("1 piece, 380 kcal"), never per
 * 100 g. These cover the conversion into the app's canonical basis, including
 * the degenerate inputs a model can return.
 */
describe('per100gFromPortion', () => {
  it('scales a portion up to a 100 g basis', () => {
    const result = per100gFromPortion(
      { kcal: 380, proteinG: 15, carbsG: 15, fatG: 21, fiberG: 1 },
      200,
    );
    expect(result.kcal).toBeCloseTo(190);
    expect(result.proteinG).toBeCloseTo(7.5);
    expect(result.carbsG).toBeCloseTo(7.5);
    expect(result.fatG).toBeCloseTo(10.5);
    expect(result.fiberG).toBeCloseTo(0.5);
  });

  it('is the exact inverse of scaleNutrients', () => {
    const per100g = { kcal: 190, proteinG: 7.5, carbsG: 7.5, fatG: 10.5, fiberG: 0.5 };
    const portion = scaleNutrients(per100g, 411);
    const recovered = per100gFromPortion(portion, 411);
    expect(recovered.kcal).toBeCloseTo(per100g.kcal);
    expect(recovered.proteinG).toBeCloseTo(per100g.proteinG);
  });

  // A model returning 0 g would otherwise produce Infinity and poison every
  // later calculation silently.
  it('throws on a non-positive portion weight', () => {
    const n = { kcal: 100, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 0 };
    expect(() => per100gFromPortion(n, 0)).toThrow();
    expect(() => per100gFromPortion(n, -5)).toThrow();
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

/** Only the fields `resultsAnswerQuery` reads; the rest of `Food` is irrelevant here. */
const result = (name: string, brand?: string) =>
  ({ name, brand }) as unknown as Parameters<typeof resultsAnswerQuery>[1][number];

/** The twelve rows a real search for "crispyking breast" returned. */
const poultry = [
  result('Turkey Breast, Sliced, Prepackaged'),
  result('Chicken Breast Tenders, Breaded, Uncooked'),
  result('Chicken Breast, Roll, Oven-roasted'),
  result('Pheasant, Breast, Meat Only, Raw'),
  result('Quail, Breast, Meat Only, Raw'),
  result('Veal, Breast, Separable Fat, Cooked'),
  result('Chicken Breast Tenders, Breaded, Cooked, Microwaved'),
  result('Duck, Wild, Breast, Meat Only, Raw'),
  result('Chicken Breast (Honey Glazed)', 'Oscar Mayer'),
  result('Ruffed Grouse, Breast Meat, Skinless, Raw'),
  result('Turkey, Whole, Breast, Meat Only, Raw'),
  result('Chicken, Broiler, Breast, Skinless, Raw'),
];

describe('resultsAnswerQuery', () => {
  it('rejects a page of results that share only the common word', () => {
    // "breast" is covered twelve times over; "crispyking" appears nowhere.
    expect(resultsAnswerQuery('crispyking breast', poultry)).toBe(false);
  });

  it('accepts the same results for a query they do answer', () => {
    expect(resultsAnswerQuery('chicken breast', poultry)).toBe(true);
  });

  it('counts a brand carried in its own field', () => {
    // Nothing is named "Oscar Mayer"; it is only ever the brand.
    expect(resultsAnswerQuery('oscar mayer honey', poultry)).toBe(true);
  });

  it('ignores punctuation and case on both sides', () => {
    expect(resultsAnswerQuery('OSCAR-MAYER', poultry)).toBe(true);
  });

  it('ignores words too short to carry a signal', () => {
    // No token survives, so there is nothing to judge and no call to spend.
    expect(resultsAnswerQuery('of a', poultry)).toBe(true);
  });

  it('ignores function words, which are long enough to survive the length filter', () => {
    // "the" is exactly three characters. Letting it decide would make the call
    // turn on whether some result happens to contain it inside a longer word.
    expect(resultsAnswerQuery('the chicken and the breast', poultry)).toBe(true);
  });

  it('treats an empty result list as a miss', () => {
    expect(resultsAnswerQuery('chicken breast', [])).toBe(false);
  });

  it('matches by substring, so a longer word covers a shorter one', () => {
    // Deliberate: the false positive withholds a charged lookup rather than
    // spending one. Pinned so it is not "fixed" into whole-word matching.
    expect(resultsAnswerQuery('ham', [result('Graham Crackers')])).toBe(true);
  });

  it('folds punctuation on the result side too, not just the query', () => {
    expect(resultsAnswerQuery('oven roasted', [result('Chicken Breast, Oven-roasted')])).toBe(true);
  });

  it('reads through accents, which the query usually lacks and the database has', () => {
    // Without this the name normalises to "jalape o" and a perfect match
    // spends a charged lookup.
    expect(resultsAnswerQuery('jalapeno', [result('Jalapeño Peppers, Raw')])).toBe(true);
    expect(resultsAnswerQuery('puree', [result('Tomato Purée')])).toBe(true);
  });

  it('matches a plural query against a singular name', () => {
    // Query word inside result word, so a longer query word never matches a
    // shorter name word on its own.
    expect(resultsAnswerQuery('almonds', [result('Almond, Raw')])).toBe(true);
    expect(resultsAnswerQuery('potatoes', [result('Potato, Boiled')])).toBe(true);
  });

  it('still rejects a miss that merely looks like a plural', () => {
    expect(resultsAnswerQuery('crispykings', poultry)).toBe(false);
  });
});

describe('byQueryCoverage', () => {
  it('puts the result that accounts for more of the query first', () => {
    // The real complaint: "Guava mang" and "Mang Tomas" matched on "mang"
    // alone and filled the screen above anything useful.
    const ranked = byQueryCoverage('mang inasal pecho', [
      result('Guava mang'),
      result('Mang Tomas'),
      result('Mang Inasal Pecho Meal'),
      result('Crispy Bangus Inasal Marinade'),
    ]);
    expect(ranked[0].name).toBe('Mang Inasal Pecho Meal');
    // The other three each cover exactly one word, so they tie and keep the
    // order the sources gave them. Only the real match moves.
    expect(ranked.slice(1).map((r) => r.name)).toEqual([
      'Guava mang',
      'Mang Tomas',
      'Crispy Bangus Inasal Marinade',
    ]);
  });

  it('keeps the source order among results that score the same', () => {
    // Cached first, then USDA, then Open Food Facts — the order searchFoods
    // already established, which a ranking must not quietly undo.
    const ranked = byQueryCoverage('mang', [
      result('Guava mang'),
      result('Mang Tomas'),
      result('st. mang Limburger'),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(['Guava mang', 'Mang Tomas', 'st. mang Limburger']);
  });

  it('removes nothing, because a weak match is still a match', () => {
    const foods = [result('Guava mang'), result('Mang Inasal Pecho')];
    expect(byQueryCoverage('mang inasal pecho', foods)).toHaveLength(2);
  });

  it('scores a brand the same as a name', () => {
    expect(queryCoverage('oscar mayer turkey', result('Turkey Breast', 'Oscar Mayer'))).toBe(3);
  });

  it('scores nothing when the query has no usable words', () => {
    expect(queryCoverage('of a', result('Anything'))).toBe(0);
  });
});
