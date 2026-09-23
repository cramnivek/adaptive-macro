import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALLOWED_MODELS, handleGeminiProxy } from '../geminiProxy';

const env = { geminiApiKey: 'server-side-key', proxyToken: 'shared-token' };

const request = (headers: Record<string, string>, body: unknown = { contents: [] }) =>
  new Request('https://example.test/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const validHeaders = {
  'x-proxy-token': 'shared-token',
  'x-gemini-model': ALLOWED_MODELS[0],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleGeminiProxy', () => {
  it('rejects a missing token without calling Google', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleGeminiProxy(request({ 'x-gemini-model': ALLOWED_MODELS[0] }), env);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong token without calling Google', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleGeminiProxy(
      request({ ...validHeaders, 'x-proxy-token': 'guessed' }),
      env,
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a model outside the allowlist', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleGeminiProxy(
      request({ ...validHeaders, 'x-gemini-model': 'gemini-3.0-ultra-expensive' }),
      env,
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // An unset variable must fail closed. With a blank expected token, a request
  // that simply omits the header would otherwise compare '' to '' and pass,
  // turning a misconfigured deploy into an open relay on a billing key.
  it('fails closed when the server is misconfigured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleGeminiProxy(request({ 'x-gemini-model': ALLOWED_MODELS[0] }), {
      geminiApiKey: '',
      proxyToken: '',
    });

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the body verbatim with the server key attached', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const body = { contents: [{ parts: [{ text: 'chickenjoy' }] }], tools: [{ google_search: {} }] };
    const response = await handleGeminiProxy(request(validHeaders, body), env);

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`${ALLOWED_MODELS[0]}:generateContent`);
    expect(url).toContain('key=server-side-key');
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  // The client maps 429 to "quota reached" and 400/403 to a key problem. If the
  // proxy flattened upstream failures to 500, every one of those messages would
  // become wrong on the proxy path.
  it('passes an upstream failure status through unchanged', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":{}}', { status: 429 }));

    const response = await handleGeminiProxy(request(validHeaders), env);

    expect(response.status).toBe(429);
  });
});
