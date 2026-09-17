import { describe, expect, it } from 'vitest';
import { sourceDomainsFrom, toCandidateFood } from '../gemini';

const validRaw = {
  name: 'Chickenjoy',
  brand: 'Jollibee',
  portionLabel: '1 piece',
  portionGrams: 100,
  kcal: 380,
  proteinG: 15,
  carbsG: 15,
  fatG: 21,
  fiberG: 1,
};

describe('toCandidateFood', () => {
  it('derives per100g and keeps both portions', () => {
    const food = toCandidateFood(validRaw, ['jollibeefoods.com']);
    expect(food.per100g.kcal).toBeCloseTo(380);
    expect(food.source).toBe('ai');
    expect(food.sources).toEqual(['jollibeefoods.com']);
    expect(food.portions[0]).toEqual({ label: '100 g', grams: 100 });
    expect(food.portions[1]).toEqual({ label: '1 piece', grams: 100 });
  });

  it('scales correctly when the portion is not 100 g', () => {
    const food = toCandidateFood({ ...validRaw, portionGrams: 411, kcal: 610 }, ['x.dev']);
    expect(food.per100g.kcal).toBeCloseTo(148.42, 1);
  });

  it('rejects a missing name', () => {
    expect(() => toCandidateFood({ ...validRaw, name: '' }, ['x.dev'])).toThrow();
  });

  it('rejects a non-positive portion weight', () => {
    expect(() => toCandidateFood({ ...validRaw, portionGrams: 0 }, ['x.dev'])).toThrow();
  });

  it('rejects garbage shapes', () => {
    expect(() => toCandidateFood(null, ['x.dev'])).toThrow();
    expect(() => toCandidateFood({ name: 'x' }, ['x.dev'])).toThrow();
    expect(() => toCandidateFood({ ...validRaw, kcal: 'lots' }, ['x.dev'])).toThrow();
  });

  it('treats a missing fibre value as zero rather than failing', () => {
    const { fiberG, ...noFibre } = validRaw;
    expect(toCandidateFood(noFibre, ['x.dev']).per100g.fiberG).toBe(0);
  });
});

/**
 * The grounded call's chunk `uri` is an opaque vertexaisearch redirect; the
 * readable domain is in `title`. These pin that, because reading `uri` instead
 * would show every source as "vertexaisearch.cloud.google.com".
 */
describe('sourceDomainsFrom', () => {
  it('reads domains from chunk titles, de-duplicated and in order', () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA', title: 'jollibeefoods.com' } },
              { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB', title: 'facebook.com' } },
              { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/CCC', title: 'jollibeefoods.com' } },
            ],
          },
        },
      ],
    };
    expect(sourceDomainsFrom(response)).toEqual(['jollibeefoods.com', 'facebook.com']);
  });

  // The load-bearing case: a confident answer with nothing behind it. This is
  // exactly what a grounded call returns when it answers from its own weights,
  // and what ANY call returns when responseSchema is set.
  it('returns empty when the response carries no grounding', () => {
    expect(sourceDomainsFrom({ candidates: [{ content: {} }] })).toEqual([]);
    expect(sourceDomainsFrom({})).toEqual([]);
    expect(sourceDomainsFrom(null)).toEqual([]);
  });

  it('skips chunks with no usable title', () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://x/AAA', title: 'ok.example' } },
              { web: { uri: 'https://x/BBB' } },
              { web: {} },
              {},
            ],
          },
        },
      ],
    };
    expect(sourceDomainsFrom(response)).toEqual(['ok.example']);
  });

  it('normalises a leading www and surrounding whitespace', () => {
    const response = {
      candidates: [
        { groundingMetadata: { groundingChunks: [{ web: { title: '  www.starbucks.com ' } }] } },
      ],
    };
    expect(sourceDomainsFrom(response)).toEqual(['starbucks.com']);
  });
});
