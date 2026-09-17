import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroundedLookupError, UngroundedResponseError, lookupFood, sourceDomainsFrom, toCandidateFood } from '../gemini';

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

/**
 * `lookupFood` is a network boundary, so it is exercised through a mocked
 * `fetch` rather than a live call. The gate covered here — no citations, no
 * Food, no second call — is the whole reason this feature can be trusted, so
 * it is pinned on the actual call sequence the mock recorded, not just on the
 * final resolved value.
 */
describe('lookupFood', () => {
  const jsonResponse = (status: number, body: unknown) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });

  const bodyOf = (call: unknown[]): any => JSON.parse((call[1] as { body: string }).body);

  const groundedResponse = {
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [
            {
              web: {
                uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA',
                title: 'jollibeefoods.com',
              },
            },
          ],
        },
        content: {
          parts: [
            {
              text: 'Serving Weight: 200 grams, Calories: 300 kcal, Protein: 20 grams, Carbs: 30 grams, Fat: 10 grams',
            },
          ],
        },
      },
    ],
  };

  const structuredRaw = {
    name: 'Chickenjoy',
    brand: 'Jollibee',
    portionLabel: '1 piece',
    portionGrams: 200,
    kcal: 300,
    proteinG: 20,
    carbsG: 30,
    fatG: 10,
    fiberG: 2,
  };

  const structuredResponse = {
    candidates: [{ content: { parts: [{ text: JSON.stringify(structuredRaw) }] } }],
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves to a Food sourced from the first call, with per100g derived rather than copied', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, groundedResponse))
      .mockResolvedValueOnce(jsonResponse(200, structuredResponse));

    const food = await lookupFood('chickenjoy', 'ph', 'test-key');

    expect(food.source).toBe('ai');
    expect(food.sources).toEqual(['jollibeefoods.com']);
    // 300 kcal for a 200 g portion -> 150 kcal per 100 g. If this were ever
    // taken straight from the model instead of derived, it would read 300.
    expect(food.per100g.kcal).toBeCloseTo(150);
    expect(food.portions[1]).toEqual({ label: '1 piece', grams: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects with UngroundedResponseError and never makes the structuring call when nothing was grounded', async () => {
    const ungroundedResponse = {
      candidates: [{ content: { parts: [{ text: 'Chickenjoy is about 380 kcal.' }] } }],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ungroundedResponse));

    await expect(lookupFood('chickenjoy', 'ph', 'test-key')).rejects.toBeInstanceOf(
      UngroundedResponseError,
    );
    // The load-bearing assertion: a future reorder or a merge back into one
    // call would still resolve the promise's rejection above, but only this
    // catches it actually skipping the second request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends google_search with no schema first, and a schema with no tools second', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, groundedResponse))
      .mockResolvedValueOnce(jsonResponse(200, structuredResponse));

    await lookupFood('chickenjoy', 'ph', 'test-key');

    const firstBody = bodyOf(fetchMock.mock.calls[0]);
    expect(firstBody.tools).toEqual([{ google_search: {} }]);
    expect(firstBody.generationConfig).toBeUndefined();

    const secondBody = bodyOf(fetchMock.mock.calls[1]);
    expect(secondBody.generationConfig.responseSchema).toBeDefined();
    expect(secondBody.tools).toBeUndefined();
  });

  it('rejects with GroundedLookupError before any fetch when the api key is empty', async () => {
    await expect(lookupFood('chickenjoy', 'ph', '   ')).rejects.toBeInstanceOf(
      GroundedLookupError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a malformed body from the structuring call as GroundedLookupError', async () => {
    const malformedResponse = {
      status: 200,
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token in JSON');
      },
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, groundedResponse))
      .mockResolvedValueOnce(malformedResponse);

    await expect(lookupFood('chickenjoy', 'ph', 'test-key')).rejects.toBeInstanceOf(
      GroundedLookupError,
    );
  });
});
