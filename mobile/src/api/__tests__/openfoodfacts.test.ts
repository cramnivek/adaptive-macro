import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROXY_TOKEN } from '../gemini';
import { lookupBarcode, searchOpenFoodFacts } from '../openfoodfacts';

// http.ts imports `Platform` from 'react-native'; that package's real entry
// file uses Flow's `import typeof` syntax, which Vite's esbuild-based
// transform cannot parse. No existing test imports http.ts (directly or
// transitively) for this reason. Mocking the module here, rather than
// touching the shared vitest config, keeps the fix scoped to this file.
// (vi.mock calls are hoisted above imports by vitest regardless of position.)
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Survives toFood (needs code, product_name, and a usable kcal field), so
// searchSearchALicious returns one hit and searchOpenFoodFacts returns early
// without falling through to the legacy endpoint -- keeping this to a single
// fetch call to assert against.
const validProduct = {
  code: '0001',
  product_name: 'Chicken Tocino',
  nutriments: { 'energy-kcal_100g': 200 },
};

describe('searchOpenFoodFacts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('on web, calls a relative /api/off/search URL carrying the proxy token', async () => {
    vi.stubGlobal('document', {});
    const fetchMock = vi.fn(async () => jsonResponse({ hits: [validProduct] }));
    vi.stubGlobal('fetch', fetchMock);

    await searchOpenFoodFacts('tocino', 20, 'ph');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith('/api/off/search')).toBe(true);
    expect((init.headers as Record<string, string>)['x-proxy-token']).toBe(PROXY_TOKEN);
  });

  it('off the web, calls openfoodfacts.org directly with no proxy token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ hits: [validProduct] }));
    vi.stubGlobal('fetch', fetchMock);

    await searchOpenFoodFacts('tocino', 20, 'ph');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('openfoodfacts.org');
    expect((init.headers as Record<string, string> | undefined)?.['x-proxy-token']).toBeUndefined();
  });
});

describe('lookupBarcode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls openfoodfacts.org directly even on web', async () => {
    vi.stubGlobal('document', {});
    const fetchMock = vi.fn(async () => jsonResponse({ status: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    await lookupBarcode('1234567890123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('openfoodfacts.org');
    expect((init.headers as Record<string, string> | undefined)?.['x-proxy-token']).toBeUndefined();
  });
});
