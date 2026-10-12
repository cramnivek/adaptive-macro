import { type ProxyEnv, handleGeminiProxy } from './geminiProxy.js';
import { handleOffProxy } from './offProxy.js';
import { handleUsdaProxy } from './usdaProxy.js';
import { callerKey, createRateLimiter } from './rateLimit.js';
import { serveStatic } from './staticFiles.js';
import { createTokenVerifier } from './userToken.js';

/*
  Gemini is the expensive one and the slow one: a grounded lookup takes most of
  a minute, so 20 in ten minutes is already far beyond any human pace and well
  under what an abuser with the extracted token would want. The data lookups
  are cheap and get typed at, so they are far looser.

  The same 20 in ten minutes applies to a signed-in person, keyed on who they
  are instead of where they appear to come from, and to a signed-out caller,
  keyed on that address.
*/
const GEMINI_LIMIT = { windowMs: 10 * 60_000, max: 20 };
const LOOKUP_LIMIT = { windowMs: 10 * 60_000, max: 150 };

/*
  How the Gemini budget is divided, now that a caller can say who they are.

  The shared token ships inside every copy of the app, so it identifies nobody:
  anyone who reads the bundle holds it. A Supabase sign-in token does identify
  a person, and the proxy checks it (userToken.ts), so a signed-in person gets
  their own daily allowance, and one person spending theirs no longer takes
  anyone else's with them. Real use is nowhere near it — a heavy day is perhaps
  fifteen calls — so sixty is generous for people and small for a script.
*/
const USER_DAILY_LIMIT = { windowMs: 24 * 60 * 60_000, max: 60 };

/*
  Callers with no valid sign-in share one pool. It exists so that testers who
  have not made an account yet keep working while the app moves over, and it is
  the pool anyone holding only the extracted shared token lands in, so it is
  sized to be exhaustible without hurting anyone who is signed in. It is also
  where signed-in people fall back to when Supabase's keys cannot be fetched,
  so an outage on their side degrades to this pool instead of to errors.
*/
const SIGNED_OUT_DAILY_LIMIT = { windowMs: 24 * 60 * 60_000, max: 100 };
const SIGNED_OUT_KEY = 'signed-out';

/*
  The ceiling that does not depend on knowing who is calling.

  Per-caller limiting for signed-out callers cannot be made spoof-proof here.
  On Cloud Run the front end appends only its own hop, so the client's own
  entry in `x-forwarded-for` stays caller-controlled — measured against the
  deployed service: twenty-one calls with no header hit the limit exactly,
  while twenty-one carrying a different invented address each sailed through on
  twenty-one fresh buckets. The signed-out pool above is what bounds those
  callers; per-user limits bound the signed-in ones.

  What is actually being protected is the bill, and the bill does not care who
  spent it. So Gemini keeps one flat daily ceiling across every caller, signed
  in or not. It is a guard rather than the everyday limit now: it sits well
  above the signed-out pool plus a realistic number of people, so ordinary use
  never meets it. Anyone able to mint many accounts could still reach it, and
  then every caller is refused until it rolls. Protecting the wallet is worth
  more than protecting availability in that case, and sign-up rate limits are
  the lever for it.
*/
const GEMINI_DAILY_CEILING = { windowMs: 24 * 60 * 60_000, max: 1_500 };

/**
 * `limit` names which limit was hit when the app needs to tell them apart:
 * a person's own daily allowance running out reads differently from the
 * service being busy.
 */
const tooMany = (retryAfterSeconds: number, limit?: 'user-daily') =>
  Response.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        ...(limit ? { 'x-limit': limit } : {}),
      },
    },
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
  const signedOutBurstLimiter = createRateLimiter(GEMINI_LIMIT);
  const userBurstLimiter = createRateLimiter(GEMINI_LIMIT);
  const userDailyLimiter = createRateLimiter(USER_DAILY_LIMIT);
  const signedOutDailyLimiter = createRateLimiter(SIGNED_OUT_DAILY_LIMIT);
  // Production wiring: no SUPABASE_URL means no verifier, so every Gemini call
  // takes the signed-out path and the Authorization header is never read.
  const verifier = opts.env.supabaseUrl
    ? createTokenVerifier({ supabaseUrl: opts.env.supabaseUrl })
    : null;
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
      // The shared token is still checked by handleGeminiProxy, as before; the
      // sign-in token only decides which limits apply. Limits run first, as
      // they always have, so a refused caller costs no upstream work.
      const who = verifier ? await verifier.check(request.headers.get('authorization')) : null;

      if (who && 'problem' in who && who.problem === 'expired') {
        return Response.json(
          { error: 'Session expired' },
          { status: 401, headers: { 'x-auth': 'expired' } },
        );
      }
      // A failed key fetch is Supabase's outage rather than a bad token, so it
      // must not lock signed-in people out; they use the signed-out pool.
      if (who && 'problem' in who && who.problem === 'invalid' && !who.keysUnavailable) {
        return Response.json({ error: 'Invalid session' }, { status: 401 });
      }

      if (who && 'userId' in who) {
        const key = `user:${who.userId}`;
        const burst = userBurstLimiter.check(key);
        if (!burst.allowed) return tooMany(burst.retryAfterSeconds);
        const daily = userDailyLimiter.check(key);
        if (!daily.allowed) return tooMany(daily.retryAfterSeconds, 'user-daily');
      } else {
        const burst = signedOutBurstLimiter.check(callerKey(request));
        if (!burst.allowed) return tooMany(burst.retryAfterSeconds);
        const pool = signedOutDailyLimiter.check(SIGNED_OUT_KEY);
        if (!pool.allowed) return tooMany(pool.retryAfterSeconds);
      }
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
