import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRouter } from '../router';

let webRoot: string;
const env = { geminiApiKey: 'server-key', proxyToken: 'shared-token' };

beforeAll(() => {
  webRoot = mkdtempSync(join(tmpdir(), 'router-'));
  writeFileSync(join(webRoot, 'index.html'), '<!DOCTYPE html><title>app</title>');
  mkdirSync(join(webRoot, '_expo'), { recursive: true });
  writeFileSync(join(webRoot, '_expo', 'bundle-abc.js'), 'console.log(1)');
});

afterEach(() => vi.unstubAllGlobals());

const get = (path: string) => new Request(`https://x.test${path}`);
const post = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://x.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: '{"contents":[]}',
  });

describe('createRouter', () => {
  it('serves index.html at the root', async () => {
    const res = await createRouter({ env, webRoot })(get('/'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('<title>app</title>');
  });

  it('serves a real asset', async () => {
    const res = await createRouter({ env, webRoot })(get('/_expo/bundle-abc.js'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('javascript');
  });

  // expo-router uses client-side paths. Opening or refreshing /describe must
  // give the app, not a 404.
  it('falls back to index.html for a client-side route', async () => {
    const res = await createRouter({ env, webRoot })(get('/describe'));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>app</title>');
  });

  it('answers /_health without touching the web build', async () => {
    const res = await createRouter({ env, webRoot: '/nonexistent' })(get('/_health'));

    expect(res.status).toBe(200);
  });

  // The whole point of co-hosting: the API is same-origin, so no CORS.
  it('routes /api/gemini to the proxy, which still rejects a missing token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await createRouter({ env, webRoot })(post('/api/gemini'));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes /api/gemini with a valid token through to the proxy', async () => {
    const fetchMock = vi.fn(async () => new Response('{"candidates":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await createRouter({ env, webRoot })(
      post('/api/gemini', { 'x-proxy-token': 'shared-token', 'x-gemini-model': 'gemini-3.5-flash' }),
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  // A stray POST must not be answered with the homepage, which would look
  // like success to a client that is actually calling the wrong path.
  it('does not serve the SPA fallback for a non-GET request', async () => {
    const res = await createRouter({ env, webRoot })(post('/not-a-route'));

    expect(res.status).toBe(404);
  });

  it('404s an unknown path when the web build is absent', async () => {
    const res = await createRouter({ env, webRoot: '/nonexistent' })(get('/anything'));

    expect(res.status).toBe(404);
  });

  // /api/ is the app's own namespace and can never be a client-side route.
  // Answering a typo with the homepage and a 200 reads as "the endpoint is up".
  it('404s a typo under /api/ instead of serving the homepage', async () => {
    const res = await createRouter({ env, webRoot })(get('/api/geminni'));

    expect(res.status).toBe(404);
  });

  it('404s /api/ itself', async () => {
    const res = await createRouter({ env, webRoot })(get('/api/'));

    expect(res.status).toBe(404);
  });

  // handleGeminiProxy always POSTs upstream, so a GET that reached it would
  // forward an empty body to Google on the shared quota.
  it('405s a GET to /api/gemini rather than forwarding it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await createRouter({ env, webRoot })(get('/api/gemini'));

    expect(res.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not answer /_health for a non-GET request', async () => {
    const res = await createRouter({ env, webRoot })(post('/_health'));

    expect(res.status).toBe(404);
  });

  // A missing chunk answered with index.html and a 200 reaches the browser as
  // a syntax error, with no 404 in the logs to point at the redeploy.
  it('404s a missing asset instead of falling back to index.html', async () => {
    const res = await createRouter({ env, webRoot })(get('/_expo/static/js/missing-chunk.js'));

    expect(res.status).toBe(404);
  });

  // The guard above must not cost the deep link the fallback exists for.
  it('still serves the app for a deep link that accepts HTML', async () => {
    const res = await createRouter({ env, webRoot })(
      new Request('https://x.test/scan', { headers: { accept: 'text/html' } }),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>app</title>');
  });

  // Proves /api/off/* reaches handleOffProxy rather than the /api/* 404 guard
  // below it -- a 401 (the handler's own token gate) is only possible if the
  // request got there at all.
  it('routes GET /api/off/search to the OFF handler, which still rejects a missing token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await createRouter({ env, webRoot })(get('/api/off/search?q=chicken'));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('405s a POST to /api/off/search', async () => {
    const res = await createRouter({ env, webRoot })(post('/api/off/search'));

    expect(res.status).toBe(405);
  });

  it('404s an unknown path under /api/off/', async () => {
    const res = await createRouter({ env, webRoot })(get('/api/off/other'));

    expect(res.status).toBe(404);
  });
});
