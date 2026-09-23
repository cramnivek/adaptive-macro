/**
 * Server-side Gemini passthrough.
 *
 * The app sends the request body it would otherwise have sent to Google; this
 * attaches the key and forwards it. Deliberately dumb: the grounding gate, the
 * `found` check and the zero-macro floor all stay in `src/api/gemini.ts`, where
 * they are tested. Duplicating them here would leave those tests pointing at a
 * copy that no longer runs.
 *
 * Lives in its own service rather than in the app because Google refuses
 * requests from EAS Hosting's Cloudflare egress — `FAILED_PRECONDITION: User
 * location is not supported`, on every call, from an IP whose reported country
 * is the same one that works directly. Cloud Run gives an attributable egress
 * on Google's own network instead.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * A passthrough is otherwise a free LLM for anyone holding the token. The
 * allowlist is what stops that costing more per call than the app ever would.
 */
export const ALLOWED_MODELS = ['gemini-3.5-flash'] as const;

export interface ProxyEnv {
  geminiApiKey: string;
  proxyToken: string;
}

export const handleGeminiProxy = async (
  request: Request,
  env: ProxyEnv,
): Promise<Response> => {
  // Fail closed. A blank expected token would otherwise match a request that
  // omits the header, so a misconfigured deploy would silently open the relay.
  if (!env.proxyToken || !env.geminiApiKey) {
    return Response.json({ error: 'Proxy is not configured' }, { status: 500 });
  }

  if (request.headers.get('x-proxy-token') !== env.proxyToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const model = request.headers.get('x-gemini-model') ?? '';
  if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
    return Response.json({ error: 'Model not allowed' }, { status: 400 });
  }

  const body = await request.text();
  const upstream = await fetch(
    `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
  );

  // Status passes through untouched so the client's existing error mapping —
  // 429 to quota, 400/403 to a key problem — keeps describing what happened.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
