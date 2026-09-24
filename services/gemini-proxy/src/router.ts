import { type ProxyEnv, handleGeminiProxy } from './geminiProxy.js';
import { serveStatic } from './staticFiles.js';

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
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);

    // Independent of the web build on purpose: a container that answers this
    // but 404s `/` is misconfigured rather than dead, and that is worth being
    // able to tell apart.
    if (pathname === '/healthz') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }

    if (pathname === '/api/gemini') {
      return handleGeminiProxy(request, opts.env);
    }

    // Only GET and HEAD can be a page. Answering a stray POST with the
    // homepage would read as success to a client calling the wrong path.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Not found', { status: 404 });
    }

    const file = await serveStatic(pathname, opts.webRoot);
    if (file) return file;

    // expo-router resolves paths on the client, so an unmatched path is a
    // route rather than a miss — unless index.html itself is absent, which
    // means the web build was not deployed.
    const index = await serveStatic('/index.html', opts.webRoot);
    return index ?? new Response('Not found', { status: 404 });
  };
};
