import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleUsdaProxy } from '../usdaProxy';

const env = {
  geminiApiKey: 'server-side-key',
  proxyToken: 'shared-token',
  usdaApiKey: 'server-usda-key',
};

const request = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://example.test${path}`, { headers });

const authed = (path: string) => request(path, { 'x-proxy-token': 'shared-token' });

const okFetch = () =>
  vi.fn(async () => new Response('{"foods":[]}', { status: 200 }));

const urlOf = (fetchMock: ReturnType<typeof okFetch>): string =>
  String(fetchMock.mock.calls[0]?.[0]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleUsdaProxy', () => {
  it('rejects a missing token without calling upstream', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleUsdaProxy(request('/api/usda/search?q=chicken'), env);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong token without calling upstream', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleUsdaProxy(
      request('/api/usda/search?q=chicken', { 'x-proxy-token': 'guessed' }),
      env,
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // An unset token must fail closed: a blank expected value would otherwise
  // match a request that omits the header entirely.
  it('fails closed when the proxy token is unset', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleUsdaProxy(
      request('/api/usda/search?q=chicken', { 'x-proxy-token': 'anything' }),
      { ...env, proxyToken: '' },
    );

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The whole point of the handler: the key is attached here and never
  // travels to the client.
  it('attaches the server key to the upstream call', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleUsdaProxy(authed('/api/usda/search?q=chicken'), env);

    expect(response.status).toBe(200);
    expect(urlOf(fetchMock)).toContain('api_key=server-usda-key');
  });

  it('never returns the key to the caller', async () => {
    vi.stubGlobal('fetch', okFetch());

    const response = await handleUsdaProxy(authed('/api/usda/search?q=chicken'), env);

    expect(await response.text()).not.toContain('server-usda-key');
    expect(JSON.stringify([...response.headers])).not.toContain('server-usda-key');
  });

  // A deploy that forgot the variable should still search rather than error.
  // The 429 that follows is surfaced by the client, so this is visible.
  it('falls back to DEMO_KEY when no server key is configured', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await handleUsdaProxy(authed('/api/usda/search?q=chicken'), { ...env, usdaApiKey: '' });

    expect(urlOf(fetchMock)).toContain('api_key=DEMO_KEY');
  });

  it('requests the whole-food data types, not Branded', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await handleUsdaProxy(authed('/api/usda/search?q=chicken'), env);

    expect(decodeURIComponent(urlOf(fetchMock))).toContain('dataType=Foundation,SR Legacy');
  });

  it('rejects an empty query without calling upstream', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleUsdaProxy(authed('/api/usda/search?q=%20'), env);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an over-long query without calling upstream', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleUsdaProxy(
      authed(`/api/usda/search?q=${'a'.repeat(201)}`),
      env,
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric or out-of-range page_size', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    for (const size of ['abc', '0', '51', '-1']) {
      const response = await handleUsdaProxy(
        authed(`/api/usda/search?q=chicken&page_size=${size}`),
        env,
      );
      expect(response.status).toBe(400);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('defaults page_size when it is absent', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await handleUsdaProxy(authed('/api/usda/search?q=chicken'), env);

    expect(urlOf(fetchMock)).toContain('pageSize=20');
  });

  // The upstream URL is built from validated parameters only. A caller who
  // can steer the host has an open relay with the key attached to it.
  it('cannot be steered at another host', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await handleUsdaProxy(
      authed('/api/usda/search?q=chicken&api_key=attacker&url=https://evil.test'),
      env,
    );

    expect(urlOf(fetchMock).startsWith('https://api.nal.usda.gov/fdc/v1/foods/search?')).toBe(
      true,
    );
    expect(urlOf(fetchMock)).not.toContain('evil.test');
    expect(urlOf(fetchMock)).not.toContain('api_key=attacker');
  });

  it('passes an upstream error status through for the client to map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"rate limit"}', { status: 429 })),
    );

    const response = await handleUsdaProxy(authed('/api/usda/search?q=chicken'), env);

    expect(response.status).toBe(429);
  });
});
