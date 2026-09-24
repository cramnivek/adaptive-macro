import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroundedLookupError, UngroundedResponseError, lookupFood, routeFor, sourceDomainsFrom, toCandidateFood } from '../gemini';

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
    found: true,
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

  it('rejects with UngroundedResponseError when the structuring call reports found: false', async () => {
    // Grounded, so it clears the sources gate — but the model said in prose it
    // could not find anything, and the structuring call is required to be
    // honest about that via `found` rather than inventing numbers to satisfy
    // the schema. This is the case FIX 1 exists for.
    const notFoundStructured = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  found: false,
                  name: 'Chickenjoy',
                  portionLabel: '',
                  portionGrams: 0,
                  kcal: 0,
                  proteinG: 0,
                  carbsG: 0,
                  fatG: 0,
                }),
              },
            ],
          },
        },
      ],
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, groundedResponse))
      .mockResolvedValueOnce(jsonResponse(200, notFoundStructured));

    await expect(lookupFood('chickenjoy', 'ph', 'test-key')).rejects.toBeInstanceOf(
      UngroundedResponseError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves normally when the structuring call reports found: true with valid figures', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, groundedResponse))
      .mockResolvedValueOnce(jsonResponse(200, structuredResponse));

    const food = await lookupFood('chickenjoy', 'ph', 'test-key');

    expect(food.name).toBe('Chickenjoy');
    expect(food.per100g.kcal).toBeCloseTo(150);
  });

  /**
   * Observed on a real device: a lookup returned 220 kcal with P0/C0/F0 and was
   * offered for saving. Calories come from macros, so an all-zero split under a
   * real calorie figure is not something a source published — it is the
   * structuring step filling required fields it had nothing to fill them with.
   * `found` catches the model admitting it found nothing; this catches the case
   * where it does not admit it.
   */
  it('rejects a found: true response whose macros are all zero under real calories', async () => {
    const zeroMacros = { ...structuredRaw, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, groundedResponse))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          candidates: [{ content: { parts: [{ text: JSON.stringify(zeroMacros) }] } }],
        }),
      );

    await expect(lookupFood('chickenjoy', 'ph', 'test-key')).rejects.toThrow();
  });

  /**
   * The guard above must not swallow drinks and other genuinely empty items,
   * where every macro really is zero and the calorie figure is near zero too.
   */
  it('still accepts an all-zero macro split when the calories are near zero too', async () => {
    const blackCoffee = {
      ...structuredRaw,
      name: 'Black coffee',
      kcal: 2,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, groundedResponse))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          candidates: [{ content: { parts: [{ text: JSON.stringify(blackCoffee) }] } }],
        }),
      );

    const food = await lookupFood('black coffee', 'ph', 'test-key');
    expect(food.name).toBe('Black coffee');
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

  // Superseded by the proxy routing: a whitespace-only key used to be rejected
  // before any fetch. It now means "use the proxy", so it reaches fetch the
  // same as any other proxy-routed call, via the grounded/structured pair above.
  it('routes a whitespace-only key through the proxy rather than rejecting it before any fetch', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, groundedResponse))
      .mockResolvedValueOnce(jsonResponse(200, structuredResponse));

    const food = await lookupFood('chickenjoy', 'ph', '   ');

    expect(food.name).toBe('Chickenjoy');
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

describe('routeFor', () => {
  // This block stubs document to exercise the browser branch; without this
  // the stub leaks into the tests after it.
  afterEach(() => vi.unstubAllGlobals());

  it('goes direct to Google when a key is set, carrying the key in the query', () => {
    const route = routeFor('gemini-3.5-flash', 'AIzaUserKey');

    expect(route.viaProxy).toBe(false);
    expect(route.url).toContain('generativelanguage.googleapis.com');
    expect(route.url).toContain('key=AIzaUserKey');
    expect(route.headers['x-proxy-token']).toBeUndefined();
  });

  it('goes through the proxy when no key is set, naming the model in a header', () => {
    const route = routeFor('gemini-3.5-flash', '');

    expect(route.viaProxy).toBe(true);
    expect(route.url).toContain('/api/gemini');
    expect(route.url).not.toContain('generativelanguage.googleapis.com');
    expect(route.headers['x-gemini-model']).toBe('gemini-3.5-flash');
  });

  it('treats a whitespace-only key as absent', () => {
    expect(routeFor('gemini-3.5-flash', '   ').viaProxy).toBe(true);
  });

  // The site is served BY the proxy, so a relative URL is same-origin on
  // whichever hostname Cloud Run answered. An absolute base would be
  // cross-origin on the service's other hostname -- both resolve -- which is
  // the CORS failure co-hosting exists to avoid.
  it('uses a relative proxy URL in a browser so the call stays same-origin', () => {
    vi.stubGlobal('document', {});

    const route = routeFor('gemini-3.5-flash', '');

    expect(route.url).toBe('/api/gemini');
    expect(route.url).not.toContain('run.app');
  });

  // Native has no origin to be relative to, so it must keep the absolute URL.
  it('uses the absolute Cloud Run URL off the web', () => {
    const route = routeFor('gemini-3.5-flash', '');

    expect(route.url).toContain('run.app/api/gemini');
  });
  // The key never leaves the device on the proxy path. If it did, the whole
  // reason for the proxy would be inverted.
  it('never sends a user key to the proxy', () => {
    const route = routeFor('gemini-3.5-flash', '');

    expect(JSON.stringify(route)).not.toContain('AIza');
  });
});

describe('lookupFood without a key', () => {
  // Before the proxy, an empty key threw "Add a Gemini API key in Settings".
  // That instruction is now wrong, so the guard must be gone.
  it('does not reject an empty key out of hand', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    ));

    await expect(lookupFood('chickenjoy', 'ph', '')).rejects.toThrow(UngroundedResponseError);

    vi.unstubAllGlobals();
  });
});
