import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouter } from '../router';
import { SUPABASE_URL, createTestKeys, supabaseClaims, type TestKeys } from './tokenFixtures';

let webRoot: string;
// No supabaseUrl: per-user limits are off, so these tests see the signed-out
// pool exactly as a deploy without SUPABASE_URL would.
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
    const router = createRouter({ env, webRoot: '/nonexistent' });
    const res = await router(get('/_health'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');

    for (const path of ['/health', '/api/health', '/livez', '/readyz', '/healthz/']) {
      const r = await router(get(path));
      expect(r.status).toBe(200);
      expect(await r.text()).toBe('ok');
    }
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

  // Same reasoning as the OFF route above: a 401 is the USDA handler's own
  // token gate, so it can only come from the request reaching that handler
  // rather than the /api/* 404 guard.
  it('routes GET /api/usda/search to the USDA handler, which still rejects a missing token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await createRouter({ env, webRoot })(get('/api/usda/search?q=chicken'));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('405s a POST to /api/usda/search', async () => {
    const res = await createRouter({ env, webRoot })(post('/api/usda/search'));

    expect(res.status).toBe(405);
  });

  it('404s an unknown path under /api/usda/', async () => {
    const res = await createRouter({ env, webRoot })(get('/api/usda/other'));

    expect(res.status).toBe(404);
  });
});

describe('rate limiting', () => {
  /** A caller the limiter can tell apart from the other tests' requests. */
  const from = (ip: string) =>
    new Request('https://x.test/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': 'wrong-on-purpose',
        // Two hops, as Google's front end actually delivers them: the client
        // it saw, then itself. callerKey reads the second from last.
        'x-forwarded-for': `${ip}, 10.0.0.1`,
      },
      body: '{"contents":[]}',
    });

  it('refuses a caller past the Gemini limit, before the token is even checked', async () => {
    const router = createRouter({ env, webRoot });

    // A bad token answers 401 while the caller is under the limit. Nothing
    // reaches Google either way, so this never spends the real quota.
    for (let i = 0; i < 20; i += 1) {
      expect((await router(from('198.51.100.7'))).status).toBe(401);
    }

    const refused = await router(from('198.51.100.7'));
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('does not punish a second caller for the first one burning the budget', async () => {
    const router = createRouter({ env, webRoot });
    for (let i = 0; i < 25; i += 1) await router(from('198.51.100.8'));

    expect((await router(from('203.0.113.4'))).status).toBe(401);
  });

  it('leaves the page itself unlimited, so a rate-limited API never blanks the app', async () => {
    const router = createRouter({ env, webRoot });
    for (let i = 0; i < 25; i += 1) await router(from('198.51.100.9'));

    const page = await router(
      new Request('https://x.test/', { headers: { 'x-forwarded-for': '198.51.100.9' } }),
    );
    expect(page.status).toBe(200);
  });
});

describe('rate limiting cannot be shaken off', () => {
  /** The same caller, each time pretending to be somewhere new. */
  const spoofing = (invented: string) =>
    new Request('https://x.test/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': 'wrong-on-purpose',
        // The head is whatever the caller sent; Google appends what it saw.
        'x-forwarded-for': `${invented}, 198.51.100.200, 10.0.0.1`,
      },
      body: '{"contents":[]}',
    });

  it('ignores an invented address, so a new one per request buys nothing', async () => {
    const router = createRouter({ env, webRoot });

    for (let i = 0; i < 20; i += 1) {
      expect((await router(spoofing(`203.0.113.${i}`))).status).toBe(401);
    }

    // A twenty-first, from a twenty-first invented address. Keyed on the head
    // this is a fresh bucket and sails through; keyed on what the proxy saw it
    // is the same caller, over their limit.
    expect((await router(spoofing('203.0.113.250'))).status).toBe(429);
  });
});

describe('the daily ceiling', () => {
  /** Each request from a different invented address AND a different real one. */
  const stranger = (n: number) =>
    new Request('https://x.test/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': 'wrong-on-purpose',
        'x-forwarded-for': `203.0.113.${n % 250}, 198.51.${n % 250}.${(n * 7) % 250}, 10.0.0.1`,
      },
      body: '{"contents":[]}',
    });

  // Without sign-in every caller shares one pool, so the pool is what stops
  // them, long before the global ceiling is in sight.
  it('caps signed-out Gemini calls at 100 a day across every caller', async () => {
    const router = createRouter({ env, webRoot });

    // Every one of these is a different caller as far as the per-caller limit
    // is concerned, so only a pool that ignores identity can stop them.
    for (let i = 0; i < 100; i += 1) {
      expect((await router(stranger(i))).status).toBe(401);
    }

    const refused = await router(stranger(1000));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('x-limit')).toBeNull();
  });

  it('leaves the food lookups alone, which are not what costs money', async () => {
    const router = createRouter({ env, webRoot });
    for (let i = 0; i < 100; i += 1) await router(stranger(i));

    const usda = await router(
      new Request('https://x.test/api/usda/search?q=chicken', {
        headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' },
      }),
    );
    expect(usda.status).not.toBe(429);
  });
});

describe('per-user limits', () => {
  const NOW = 1_800_000_000_000;
  const userEnv = { ...env, supabaseUrl: SUPABASE_URL };
  let keys: TestKeys;
  let jwksFetches = 0;

  beforeAll(async () => {
    keys = await createTestKeys();
  });

  beforeEach(() => {
    // Only the clock is faked: the limiters read Date.now, and sixty calls a
    // day cannot be spaced past a ten-minute burst window in real time.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    jwksFetches = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('jwks.json')) {
          jwksFetches += 1;
          return new Response(JSON.stringify(keys.jwks), { status: 200 });
        }
        return new Response('{"candidates":[]}', { status: 200 });
      }),
    );
  });

  afterEach(() => vi.useRealTimers());

  /** A token good for two days, so a test can run a day's calls on its clock. */
  const tokenFor = (sub: string, claims: Record<string, unknown> = {}) =>
    keys.sign(supabaseClaims(NOW, { sub, exp: Math.floor(NOW / 1000) + 172_800, ...claims }));

  /** The wrong shared token on purpose: the call stops at 401 and never reaches Google. */
  const call = (token: string | null, ip = '198.51.100.1') =>
    new Request('https://x.test/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': 'wrong-on-purpose',
        'x-forwarded-for': `${ip}, 10.0.0.1`,
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      body: '{"contents":[]}',
    });

  /** Spaces calls 31 seconds apart: under the burst limit, far inside a day. */
  const later = (ms = 31_000) => vi.setSystemTime(Date.now() + ms);

  it('gives a signed-in person 60 calls a day, then says their own allowance is spent', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const token = await tokenFor('alice');

    for (let i = 0; i < 60; i += 1) {
      later();
      expect((await router(call(token))).status).toBe(401);
    }

    later();
    const refused = await router(call(token));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('x-limit')).toBe('user-daily');
    expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('does not let two people share a count', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const alice = await tokenFor('alice');
    const bob = await tokenFor('bob');

    for (let i = 0; i < 60; i += 1) {
      later();
      await router(call(alice));
    }
    later();
    expect((await router(call(alice))).status).toBe(429);

    expect((await router(call(bob))).status).toBe(401);
  });

  // The burst limit is keyed on the person now, not the address: two people
  // behind one router are not one caller, and one person can't change address.
  it('keys the burst limit on the person rather than the address', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const alice = await tokenFor('alice');
    const bob = await tokenFor('bob');

    for (let i = 0; i < 20; i += 1) expect((await router(call(alice, '203.0.113.9'))).status).toBe(401);

    const burst = await router(call(alice, '203.0.113.77'));
    expect(burst.status).toBe(429);
    expect(burst.headers.get('x-limit')).toBeNull();
    expect((await router(call(bob, '203.0.113.9'))).status).toBe(401);
  });

  it('treats a call with no token as signed out, and does not fetch keys for it', async () => {
    const router = createRouter({ env: userEnv, webRoot });

    expect((await router(call(null))).status).toBe(401);
    expect(jwksFetches).toBe(0);
  });

  it('keeps the signed-out pool separate from signed-in people', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const alice = await tokenFor('alice');

    for (let i = 0; i < 100; i += 1) {
      later();
      await router(call(null, `203.0.113.${i}`));
    }
    later();
    expect((await router(call(null, '203.0.113.200'))).status).toBe(429);

    expect((await router(call(alice))).status).toBe(401);
  });

  it('binds the global ceiling across signed-in and signed-out callers together', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const people = await Promise.all(Array.from({ length: 25 }, (_, i) => tokenFor(`user-${i}`)));

    // 100 signed out, which empties that pool, then 1,400 spread over 24
    // people who each stay under their own 60. Thirty seconds apart keeps each
    // person under the burst limit and the whole run inside one day.
    for (let i = 0; i < 100; i += 1) {
      later(30_000);
      expect((await router(call(null, `203.0.113.${i}`))).status).toBe(401);
    }
    for (let i = 0; i < 1_400; i += 1) {
      later(30_000);
      expect((await router(call(people[i % 24] as string))).status).toBe(401);
    }

    // 1,500 spent. Nobody here is over a personal limit, so only the ceiling
    // can refuse the 25th person's first call.
    later(30_000);
    const refused = await router(call(people[24] as string));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('x-limit')).toBeNull();
  });

  it('answers an expired session with x-auth: expired, before anything is counted', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const stale = await tokenFor('alice', { exp: Math.floor(NOW / 1000) - 3600 });

    const res = await router(call(stale));

    expect(res.status).toBe(401);
    expect(res.headers.get('x-auth')).toBe('expired');
    expect(await res.json()).toEqual({ error: 'Session expired' });
  });

  it('answers a forged token with 401 and no hint to refresh', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const good = await tokenFor('alice');
    const [header, , signature] = good.split('.');
    const forged = Buffer.from(JSON.stringify(supabaseClaims(NOW, { sub: 'bob' }))).toString('base64url');

    const res = await router(call(`${header}.${forged}.${signature}`));

    expect(res.status).toBe(401);
    expect(res.headers.get('x-auth')).toBeNull();
    expect(await res.json()).toEqual({ error: 'Invalid session' });
  });

  // A bad bearer costs an ECDSA verify. If the 401 came before any limiter,
  // a caller could force one per request without ever being counted.
  it('rate limits a caller who keeps sending forged tokens', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const good = await tokenFor('alice');
    const [header, , signature] = good.split('.');
    const forged = Buffer.from(JSON.stringify(supabaseClaims(NOW, { sub: 'bob' }))).toString('base64url');
    const bad = `${header}.${forged}.${signature}`;

    for (let i = 0; i < 20; i += 1) expect((await router(call(bad, '203.0.113.5'))).status).toBe(401);

    const refused = await router(call(bad, '203.0.113.5'));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('x-limit')).toBeNull();
    // Someone else at another address is not punished for it.
    expect((await router(call(bad, '203.0.113.6'))).status).toBe(401);
  });

  it('rate limits a caller who keeps sending expired tokens', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const stale = await tokenFor('alice', { exp: Math.floor(NOW / 1000) - 3600 });

    for (let i = 0; i < 20; i += 1) expect((await router(call(stale, '203.0.113.5'))).status).toBe(401);

    expect((await router(call(stale, '203.0.113.5'))).status).toBe(429);
  });

  it('lets a signed-in caller through to the signed-out pool when Supabase keys are unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad gateway', { status: 502 })));
    const router = createRouter({ env: userEnv, webRoot });
    const alice = await tokenFor('alice');

    // The proxy's own 401 ("Unauthorized"), not "Invalid session".
    const res = await router(call(alice));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('ignores the token entirely when SUPABASE_URL is not set', async () => {
    const router = createRouter({ env, webRoot });
    const alice = await tokenFor('alice');
    const garbage = 'not-a-jwt';

    // Past 60 would be refused had the token been honoured.
    for (let i = 0; i < 70; i += 1) {
      later();
      expect((await router(call(i % 2 === 0 ? alice : garbage))).status).toBe(401);
    }
    expect(jwksFetches).toBe(0);
  });

  it('still lets a verified person with the shared token through to Google', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const alice = await tokenFor('alice');

    const res = await router(
      new Request('https://x.test/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-proxy-token': 'shared-token',
          'x-gemini-model': 'gemini-3.5-flash',
          authorization: `Bearer ${alice}`,
        },
        body: '{"contents":[]}',
      }),
    );

    expect(res.status).toBe(200);
  });

  it('leaves the food lookups to their own per-caller limit, with or without a token', async () => {
    const router = createRouter({ env: userEnv, webRoot });
    const alice = await tokenFor('alice');

    const usda = await router(
      new Request('https://x.test/api/usda/search?q=chicken', {
        headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1', authorization: `Bearer ${alice}` },
      }),
    );

    expect(usda.status).toBe(401);
    expect(jwksFetches).toBe(0);
  });

  describe('/api/upload-card security and validation', () => {
    const validJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const invalidFile = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);

    it('refuses non-POST methods', async () => {
      const router = createRouter({ env, webRoot });
      const res = await router(new Request('https://x.test/api/upload-card', { method: 'GET' }));
      expect(res.status).toBe(405);
    });

    it('refuses unauthenticated upload attempts with 401', async () => {
      const router = createRouter({ env: userEnv, webRoot });
      const res = await router(
        new Request('https://x.test/api/upload-card?sessionId=sess1', {
          method: 'POST',
          body: validJpeg,
        }),
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatch(/Authentication required/);
    });

    it('refuses proxy-token alone with 401 (no proxy-token bypass allowed)', async () => {
      const router = createRouter({ env: userEnv, webRoot });
      const res = await router(
        new Request('https://x.test/api/upload-card?sessionId=sess1', {
          method: 'POST',
          headers: { 'x-proxy-token': 'shared-token' },
          body: validJpeg,
        }),
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatch(/signed-in user required/);
    });

    it('refuses expired user token with 401 and x-auth: expired', async () => {
      const router = createRouter({ env: userEnv, webRoot });
      const expired = await keys.sign(
        supabaseClaims(NOW, { sub: 'bob', exp: Math.floor(NOW / 1000) - 100 }),
      );
      const res = await router(
        new Request('https://x.test/api/upload-card?sessionId=sess1', {
          method: 'POST',
          headers: { authorization: `Bearer ${expired}` },
          body: validJpeg,
        }),
      );
      expect(res.status).toBe(401);
      expect(res.headers.get('x-auth')).toBe('expired');
      expect(await res.json()).toEqual({ error: 'Session expired' });
    });

    it('refuses request missing sessionId with 400', async () => {
      const router = createRouter({ env: userEnv, webRoot });
      const alice = await tokenFor('alice');
      const res = await router(
        new Request('https://x.test/api/upload-card', {
          method: 'POST',
          headers: { authorization: `Bearer ${alice}` },
          body: validJpeg,
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'sessionId required' });
    });

    it('refuses empty body with 400', async () => {
      const router = createRouter({ env: userEnv, webRoot });
      const alice = await tokenFor('alice');
      const res = await router(
        new Request('https://x.test/api/upload-card?sessionId=sess1', {
          method: 'POST',
          headers: { authorization: `Bearer ${alice}` },
          body: new Uint8Array([]),
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Empty body' });
    });

    it('refuses non-image magic bytes with 400', async () => {
      const router = createRouter({ env: userEnv, webRoot });
      const alice = await tokenFor('alice');
      const res = await router(
        new Request('https://x.test/api/upload-card?sessionId=sess1', {
          method: 'POST',
          headers: { authorization: `Bearer ${alice}` },
          body: invalidFile,
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid image format. Expected JPEG, PNG, or WebP' });
    });

    it('refuses images exceeding 5MB ceiling with 413', async () => {
      const router = createRouter({ env: userEnv, webRoot });
      const alice = await tokenFor('alice');
      const oversized = new Uint8Array(5 * 1024 * 1024 + 10);
      oversized[0] = 0xff;
      oversized[1] = 0xd8;
      oversized[2] = 0xff;
      const res = await router(
        new Request('https://x.test/api/upload-card?sessionId=sess1', {
          method: 'POST',
          headers: { authorization: `Bearer ${alice}` },
          body: oversized,
        }),
      );
      expect(res.status).toBe(413);
    });

    it('scopes filename to user ID when authenticated with Supabase token', async () => {
      let uploadedFilename = '';
      const mockUploader = vi.fn(async (filename: string) => {
        uploadedFilename = filename;
        return `https://storage.googleapis.com/test-bucket/${filename}`;
      });

      const router = createRouter({
        env: userEnv,
        webRoot,
        uploadCardImpl: mockUploader,
      });
      const alice = await tokenFor('alice');

      const res = await router(
        new Request('https://x.test/api/upload-card?sessionId=workout_123', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${alice}`,
          },
          body: validJpeg,
        }),
      );

      expect(res.status).toBe(200);
      expect(uploadedFilename).toBe('alice/workout_123.jpg');
      expect(await res.json()).toEqual({
        ok: true,
        // The bucket is private: the address handed back is this service's
        // checked route, not the bucket's.
        url: '/api/card?author=alice&session=workout_123',
      });
    });

    it('enforces upload rate limiting per user', async () => {
      const mockUploader = vi.fn(async (filename: string) => `https://test/${filename}`);
      const router = createRouter({
        env: userEnv,
        webRoot,
        uploadCardImpl: mockUploader,
      });
      const alice = await tokenFor('alice');

      for (let i = 0; i < 15; i++) {
        const res = await router(
          new Request(`https://x.test/api/upload-card?sessionId=sess_${i}`, {
            method: 'POST',
            headers: { authorization: `Bearer ${alice}` },
            body: validJpeg,
          }),
        );
        expect(res.status).toBe(200);
      }

      // 16th upload exceeds per-user rate limit
      const resExceeded = await router(
        new Request('https://x.test/api/upload-card?sessionId=sess_16', {
          method: 'POST',
          headers: { authorization: `Bearer ${alice}` },
          body: validJpeg,
        }),
      );
      expect(resExceeded.status).toBe(429);
    });
  });
});
