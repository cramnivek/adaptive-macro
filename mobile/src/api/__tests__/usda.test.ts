import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROXY_TOKEN } from '../gemini';
import { USDA_DEMO_KEY, searchUsda } from '../usda';

// Same reason as openfoodfacts.test.ts: usda.ts imports http.ts, which imports
// `Platform` from 'react-native', whose real entry file uses Flow's
// `import typeof` syntax that Vite's esbuild transform cannot parse.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

// Survives toFood: needs an fdcId, a description and a usable kcal nutrient.
const validFood = {
  fdcId: 1234,
  description: 'Chicken, raw',
  foodNutrients: [{ nutrientId: 1008, value: 120 }],
};

const stubFetch = () => {
  // Parameters are declared so the recorded calls are typed: a zero-arg mock
  // gives an empty tuple, and reading call[0] off it is a type error.
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    jsonResponse({ foods: [validFood] }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const urlOf = (fetchMock: ReturnType<typeof stubFetch>): string =>
  String(fetchMock.mock.calls[0]?.[0]);

const headersOf = (fetchMock: ReturnType<typeof stubFetch>): Record<string, string> =>
  ((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers ?? {}) as Record<
    string,
    string
  >;

describe('searchUsda', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('on web, calls a relative /api/usda/search URL carrying the proxy token', async () => {
    vi.stubGlobal('document', {});
    const fetchMock = stubFetch();

    const foods = await searchUsda('chicken', USDA_DEMO_KEY);

    expect(urlOf(fetchMock).startsWith('/api/usda/search?')).toBe(true);
    expect(headersOf(fetchMock)['x-proxy-token']).toBe(PROXY_TOKEN);
    expect(foods).toHaveLength(1);
  });

  // The key is the thing this route exists to keep server-side, so no request
  // the app makes on the shared route may carry one.
  it('never sends an api_key when going through the proxy', async () => {
    vi.stubGlobal('document', {});
    const fetchMock = stubFetch();

    await searchUsda('chicken', USDA_DEMO_KEY);

    expect(urlOf(fetchMock)).not.toContain('api_key');
  });

  it('treats an empty setting as no key and still uses the proxy', async () => {
    vi.stubGlobal('document', {});
    const fetchMock = stubFetch();

    await searchUsda('chicken', '   ');

    expect(urlOf(fetchMock).startsWith('/api/usda/search?')).toBe(true);
  });

  // A key in Settings keeps that user off the shared quota, and means a proxy
  // outage degrades to "enter a key" rather than to a broken feature.
  it("calls USDA directly with the user's own key, on any platform", async () => {
    vi.stubGlobal('document', {});
    const fetchMock = stubFetch();

    await searchUsda('chicken', 'personal-key');

    expect(urlOf(fetchMock).startsWith('https://api.nal.usda.gov/fdc/v1/foods/search?')).toBe(
      true,
    );
    expect(urlOf(fetchMock)).toContain('api_key=personal-key');
    expect(headersOf(fetchMock)['x-proxy-token']).toBeUndefined();
  });

  // Off web there is no origin to be relative to, so the proxy route has to
  // carry an absolute base or the request goes nowhere.
  it('on a device, uses an absolute proxy URL', async () => {
    const fetchMock = stubFetch();

    await searchUsda('chicken', USDA_DEMO_KEY);

    expect(urlOf(fetchMock)).toMatch(/^https?:\/\/.+\/api\/usda\/search\?/);
  });

  it('asks for the requested page size on the proxy route', async () => {
    vi.stubGlobal('document', {});
    const fetchMock = stubFetch();

    await searchUsda('chicken', USDA_DEMO_KEY, 5);

    expect(urlOf(fetchMock)).toContain('page_size=5');
  });
});
