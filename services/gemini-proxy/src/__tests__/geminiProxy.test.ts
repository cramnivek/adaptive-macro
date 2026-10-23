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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('handleGeminiProxy', () => {
  const photoBody = {
    contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'test-image' } }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: { properties: { items: { type: 'array' }, notFood: { type: 'boolean' } } } },
  };

  it('gives older image clients a low-thinking default while preserving their schema', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await handleGeminiProxy(request(validHeaders, photoBody), env);
    const forwarded = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(forwarded.generationConfig).toEqual({ ...photoBody.generationConfig, thinkingConfig: { thinkingLevel: 'low' } });
    expect(forwarded.contents).toEqual(photoBody.contents);
  });

  it('preserves an explicit image thinking configuration and grounded requests', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    for (const body of [
      { ...photoBody, generationConfig: { thinkingConfig: { thinkingLevel: 'high' } } },
      { ...photoBody, tools: [{ google_search: {} }] },
      { ...photoBody, generationConfig: { responseMimeType: 'application/json' } },
    ]) {
      await handleGeminiProxy(request(validHeaders, body), env);
      expect(JSON.parse(fetchMock.mock.calls.at(-1)![1]!.body as string)).toEqual(body);
    }
  });

  it.each(['fetch', 'body'] as const)('bounds stalled image %s even if it ignores cancellation', async (stage) => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      signal = init.signal;
      if (stage === 'fetch') return new Promise(() => {});
      const response = new Response('{}');
      response.arrayBuffer = () => new Promise(() => {});
      return response;
    }));
    const pending = handleGeminiProxy(request(validHeaders, photoBody), env);
    await vi.advanceTimersByTimeAsync(45_000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(response.headers.get('x-estimate-timeout')).toBe('1');
    expect(await response.json()).toEqual({ error: 'Estimate timed out. Try again or describe the meal.' });
    expect(signal?.aborted).toBe(true);
  });

  it('bounds other Gemini calls below the Cloud Run deadline too', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const pending = handleGeminiProxy(request(validHeaders), env);
    await vi.advanceTimersByTimeAsync(110_000);
    expect((await pending).status).toBe(504);
  });

  it('returns the deadline response when the upstream transport rejects on abort', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const pending = handleGeminiProxy(request(validHeaders, photoBody), env);
    await vi.advanceTimersByTimeAsync(45_000);
    expect((await pending).status).toBe(504);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up its deadline after a successful response', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    expect((await handleGeminiProxy(request(validHeaders, photoBody), env)).status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });
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
