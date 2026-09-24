import type { ProxyEnv } from './geminiProxy.js';

/**
 * Server-side USDA FoodData Central search.
 *
 * Unlike Open Food Facts, USDA does send CORS headers and a browser can call
 * it directly. This proxy exists for the key, not for reachability: the key
 * is what the quota is attached to, and one shipped in the app bundle is
 * readable by anyone who opens the site and spendable by anyone who finds it.
 *
 * The upstream URL is built here from validated parameters and is never taken
 * from the request, for the same reason as the Open Food Facts proxy: one that
 * forwarded a client-supplied URL would be an open relay into anything this
 * container can reach — and here it would also attach the key to it.
 */

const BASE = 'https://api.nal.usda.gov/fdc/v1';
const MAX_QUERY = 200;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/**
 * Foundation and SR Legacy hold the authoritative whole-food data, which is
 * where Open Food Facts is weakest; Branded is left to OFF. Fixed here rather
 * than taken from the caller so the shared key can only ever be spent on the
 * search this app actually makes.
 */
const DATA_TYPE = 'Foundation,SR Legacy';

/**
 * USDA's public key. Rate limited to roughly 30 requests per hour per IP,
 * which one search session can exhaust.
 *
 * Used when USDA_API_KEY is unset so a deploy that forgot it still searches
 * instead of erroring. The degradation is visible rather than silent: the
 * client surfaces the 429 that follows as a warning above the results.
 */
const DEMO_KEY = 'DEMO_KEY';

const pageSizeFrom = (raw: string | null): number | null => {
  if (raw === null) return DEFAULT_PAGE_SIZE;
  if (!/^\d+$/.test(raw)) return null;
  const size = Number(raw);
  return size >= 1 && size <= MAX_PAGE_SIZE ? size : null;
};

export const handleUsdaProxy = async (
  request: Request,
  env: ProxyEnv,
): Promise<Response> => {
  // Fail closed, as the other handlers do: a blank expected token would match
  // a request that omits the header.
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

  const upstream =
    `${BASE}/foods/search?api_key=${encodeURIComponent(env.usdaApiKey || DEMO_KEY)}` +
    `&query=${encodeURIComponent(query)}&pageSize=${pageSize}` +
    `&dataType=${encodeURIComponent(DATA_TYPE)}`;

  const response = await fetch(upstream, { headers: { Accept: 'application/json' } });

  // Status passes through so the client's existing error mapping keeps
  // working — including the 429 the app already renders above the results.
  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
