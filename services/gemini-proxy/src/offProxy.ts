import type { ProxyEnv } from './geminiProxy.js';

/**
 * Server-side Open Food Facts search.
 *
 * OFF's search endpoints send no `Access-Control-Allow-Origin`, so a browser
 * cannot call them at all — measured against the live API, a plain GET with no
 * custom headers still fails. Its barcode endpoint does send them and is
 * therefore still called directly by the app on every platform.
 *
 * The upstream URL is built here from validated parameters and is never taken
 * from the request. A proxy that forwarded a client-supplied URL would be an
 * open relay into anything this container can reach.
 */

const SEARCH_HOST = 'https://search.openfoodfacts.org';
const MAX_QUERY = 200;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/** OFF asks callers to identify themselves. Browsers forbid script setting it. */
const USER_AGENT = 'adaptive-macros/0.1 (https://github.com/cramnivek/adaptive-macro)';

const FIELDS =
  'code,product_name,brands,quantity,serving_size,serving_quantity,nutriments';

const pageSizeFrom = (raw: string | null): number | null => {
  if (raw === null) return DEFAULT_PAGE_SIZE;
  if (!/^\d+$/.test(raw)) return null;
  const size = Number(raw);
  return size >= 1 && size <= MAX_PAGE_SIZE ? size : null;
};

/**
 * `world` or a two-letter code, and nothing else.
 *
 * This value becomes a hostname label. Anything unvalidated here would let a
 * caller point the request at a host of their choosing.
 */
const countryFrom = (raw: string | null): string | null => {
  const code = (raw ?? 'world').trim().toLowerCase();
  return /^[a-z]{2}$|^world$/.test(code) ? code : null;
};

export const handleOffProxy = async (
  request: Request,
  env: ProxyEnv,
  mode: 'search' | 'legacy',
): Promise<Response> => {
  // Fail closed, as the Gemini handler does: a blank expected token would
  // match a request that omits the header.
  if (!env.proxyToken) {
    return Response.json({ error: 'Proxy is not configured' }, { status: 500 });
  }

  if (request.headers.get('x-proxy-token') !== env.proxyToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;

  const query = (params.get('q') ?? '').trim();
  if (!query || query.length > MAX_QUERY) {
    return Response.json({ error: 'Bad query' }, { status: 400 });
  }

  const pageSize = pageSizeFrom(params.get('page_size'));
  if (pageSize === null) {
    return Response.json({ error: 'Bad page_size' }, { status: 400 });
  }

  let upstream: string;
  if (mode === 'search') {
    upstream = `${SEARCH_HOST}/search?q=${encodeURIComponent(query)}&page_size=${pageSize}`;
  } else {
    const country = countryFrom(params.get('country'));
    if (country === null) {
      return Response.json({ error: 'Bad country' }, { status: 400 });
    }
    upstream =
      `https://${country}.openfoodfacts.org/cgi/search.pl` +
      `?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process` +
      `&json=1&page_size=${pageSize}&fields=${FIELDS}`;
  }

  const response = await fetch(upstream, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  // Status passes through so the client's existing error mapping keeps working.
  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
