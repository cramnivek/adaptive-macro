import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleOffProxy } from '../offProxy';

const env = { geminiApiKey: 'server-side-key', proxyToken: 'shared-token' };

const request = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://example.test${path}`, { headers });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleOffProxy', () => {
  it('rejects a missing token without calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleOffProxy(request('/api/off/search?q=chicken'), env, 'search');

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong token without calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleOffProxy(
      request('/api/off/search?q=chicken', { 'x-proxy-token': 'guessed' }),
      env,
      'search',
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // An unset variable must fail closed: a blank expected token would
  // otherwise match a request that omits the header entirely.
  it('fails closed when the server is misconfigured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleOffProxy(
      request('/api/off/search?q=chicken', { 'x-proxy-token': 'anything' }),
      { geminiApiKey: 'x', proxyToken: '' },
      'search',
    );

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing q', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleOffProxy(
      request('/api/off/search', { 'x-proxy-token': 'shared-token' }),
      env,
      'search',
    );

    expect(response.status).toBe(400);
  });

  it('rejects an empty q', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleOffProxy(
      request('/api/off/search?q=', { 'x-proxy-token': 'shared-token' }),
      env,
      'search',
    );

    expect(response.status).toBe(400);
  });

  it('rejects a q longer than 200 characters', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const longQuery = 'a'.repeat(201);
    const response = await handleOffProxy(
      request(`/api/off/search?q=${longQuery}`, { 'x-proxy-token': 'shared-token' }),
      env,
      'search',
    );

    expect(response.status).toBe(400);
  });

  it.each(['0', '51', 'abc'])('rejects page_size=%s', async (pageSize) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleOffProxy(
      request(`/api/off/search?q=chicken&page_size=${pageSize}`, {
        'x-proxy-token': 'shared-token',
      }),
      env,
      'search',
    );

    expect(response.status).toBe(400);
  });

  it('forwards a valid search call to search.openfoodfacts.org with the query encoded and a User-Agent', async () => {
    const fetchMock = vi.fn(async () => new Response('{"hits":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleOffProxy(
      request('/api/off/search?q=chicken+tocino&page_size=10', {
        'x-proxy-token': 'shared-token',
      }),
      env,
      'search',
    );

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://search.openfoodfacts.org/search');
    expect(url).toContain(`q=${encodeURIComponent('chicken tocino')}`);
    expect(url).toContain('page_size=10');
    expect((init.headers as Record<string, string>)['User-Agent']).toBeTruthy();
  });

  it('forwards a valid legacy call with country=ph to ph.openfoodfacts.org', async () => {
    const fetchMock = vi.fn(async () => new Response('{"products":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleOffProxy(
      request('/api/off/legacy?q=chicken&country=ph', { 'x-proxy-token': 'shared-token' }),
      env,
      'legacy',
    );

    expect(response.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://ph.openfoodfacts.org/cgi/search.pl');
  });

  // The SSRF guard: country becomes a hostname label, so it must be rejected
  // before ever reaching fetch, not merely answered with a 400.
  it.each(['../evil', 'evil.com'])(
    'rejects country=%s and never calls fetch (SSRF guard)',
    async (country) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const response = await handleOffProxy(
        request(`/api/off/legacy?q=chicken&country=${encodeURIComponent(country)}`, {
          'x-proxy-token': 'shared-token',
        }),
        env,
        'legacy',
      );

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('passes an upstream failure status through unchanged', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":true}', { status: 503 }));

    const response = await handleOffProxy(
      request('/api/off/search?q=chicken', { 'x-proxy-token': 'shared-token' }),
      env,
      'search',
    );

    expect(response.status).toBe(503);
  });
});
