import { type ProxyEnv, handleGeminiProxy } from './geminiProxy.js';
import { handleOffProxy } from './offProxy.js';
import { handleUsdaProxy } from './usdaProxy.js';
import { callerKey, createRateLimiter } from './rateLimit.js';
import { serveStatic } from './staticFiles.js';

/*
  Gemini is the expensive one and the slow one: a grounded lookup takes most of
  a minute, so 20 in ten minutes is already far beyond any human pace and well
  under what an abuser with the extracted token would want. The data lookups
  are cheap and get typed at, so they are far looser.
*/
const GEMINI_LIMIT = { windowMs: 10 * 60_000, max: 20 };
const LOOKUP_LIMIT = { windowMs: 10 * 60_000, max: 150 };

/*
  The ceiling that does not depend on knowing who is calling.

  Per-caller limiting cannot be made spoof-proof here. On Cloud Run the front
  end appends only its own hop, so the client's own entry in `x-forwarded-for`
  stays caller-controlled — measured against the deployed service: twenty-one
  calls with no header hit the limit exactly, while twenty-one carrying a
  different invented address each sailed through on twenty-one fresh buckets.

  What is actually being protected is the bill, and the bill does not care who
  spent it. So Gemini also has a flat daily ceiling across every caller. A real
  user is nowhere near 300 grounded calls in a day — each takes most of a
  minute — and an abuser with the extracted token is capped at a bounded,
  affordable number instead of an open tab.

  The cost of this is honest and deliberate: someone flooding the service can
  exhaust the day's allowance and lock the real user out of lookups until it
  rolls. Protecting the wallet is worth more than protecting availability here,
  and per-user credentials are what remove the trade-off.
*/
const GEMINI_DAILY_CEILING = { windowMs: 24 * 60 * 60_000, max: 300 };

const tooMany = (retryAfterSeconds: number) =>
  Response.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );

/**
 * Dispatches one origin between the API and the web build.
 *
 * Co-hosting is the point: the app and `/api/gemini` share an origin, so the
 * browser never runs a CORS preflight and the shared token never crosses an
 * origin boundary. An earlier design had the site and the API on separate
 * hosts, which failed every call with `TypeError: Failed to fetch` and would
 * have needed an allowlist kept correct forever.
 */
export const createRouter = (opts: { env: ProxyEnv; webRoot: string }) => {
  // One limiter per route family, held across requests by the closure.
  const geminiLimiter = createRateLimiter(GEMINI_LIMIT);
  const geminiCeiling = createRateLimiter(GEMINI_DAILY_CEILING);
  const lookupLimiter = createRateLimiter(LOOKUP_LIMIT);

  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/gemini') {
      // handleGeminiProxy always POSTs upstream. Without this, a GET with a
      // valid token forwards an empty body to Google on the shared quota.
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      const verdict = geminiLimiter.check(callerKey(request));
      if (!verdict.allowed) return tooMany(verdict.retryAfterSeconds);
      const ceiling = geminiCeiling.check('all');
      if (!ceiling.allowed) return tooMany(ceiling.retryAfterSeconds);
      return handleGeminiProxy(request, opts.env);
    }

    if (pathname === '/api/off/search' || pathname === '/api/off/legacy') {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
      }
      const verdict = lookupLimiter.check(callerKey(request));
      if (!verdict.allowed) return tooMany(verdict.retryAfterSeconds);
      return handleOffProxy(
        request,
        opts.env,
        pathname === '/api/off/legacy' ? 'legacy' : 'search',
      );
    }

    if (pathname === '/api/usda/search') {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
      }
      const verdict = lookupLimiter.check(callerKey(request));
      if (!verdict.allowed) return tooMany(verdict.retryAfterSeconds);
      return handleUsdaProxy(request, opts.env);
    }

    // Nothing else lives under /api/. Falling through would answer a typo
    // with the homepage and a 200, which reads as "the endpoint is up".
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Only GET and HEAD can be a page. Answering a stray POST with the
    // homepage would read as success to a client calling the wrong path.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Not found', { status: 404 });
    }

    // NOT /healthz, which Google Front End intercepts on Cloud Run: it answers
    // its own 404 page and the request never reaches the container. Measured
    // against the deployment -- /health, /livez, /readyz and /healthz/ all pass
    // through, only the exact /healthz does not. Do not rename this back.
    // Independent of the web build on purpose: a container that answers this
    // but 404s `/` is misconfigured rather than dead, and that is worth being
    // able to tell apart.
    if (pathname === '/_health') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }

    const file = await serveStatic(pathname, opts.webRoot);
    if (file) return file;

    // The fallback exists so a deep link like `/scan` loads the app. It must
    // not answer for a missing *asset*: index.html with a 200 reaches a caller
    // expecting JavaScript or wasm as a syntax error or a MIME refusal, and
    // leaves no 404 in the logs to point at the cause.
    const looksLikeAsset = /\.[a-z0-9]+$/i.test(pathname);
    const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html');
    if (looksLikeAsset && !wantsHtml) {
      return new Response('Not found', { status: 404 });
    }

    // expo-router resolves paths on the client, so an unmatched path is a
    // route rather than a miss — unless index.html itself is absent, which
    // means the web build was not deployed.
    const index = await serveStatic('/index.html', opts.webRoot);
    return index ?? new Response('Not found', { status: 404 });
  };
};
