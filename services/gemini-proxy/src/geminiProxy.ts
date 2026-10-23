/**
 * Server-side Gemini passthrough.
 *
 * The app sends the request body it would otherwise have sent to Google; this
 * attaches the key and forwards it with a bounded deadline and a fast default
 * for meal estimates. The grounding gate, the
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
  /** USDA FoodData Central. Falls back to DEMO_KEY's tiny quota when unset. */
  usdaApiKey: string;
  /**
   * The Supabase project URL whose sign-in tokens the router verifies. Empty
   * switches per-user limits off: every Gemini call then uses the signed-out
   * pool, which is how a deploy without this setting keeps working.
   */
  supabaseUrl: string;
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

  let body = await request.text();
  let payload;
  try { payload = JSON.parse(body); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const image = Array.isArray(payload?.contents) && payload.contents.some((content: any) =>
    Array.isArray(content?.parts) && content.parts.some((part: any) =>
      typeof part?.inlineData?.mimeType === 'string' && part.inlineData.mimeType.startsWith('image/')));
  const config = payload?.generationConfig;
  const meal = config?.responseSchema?.properties?.notFood && config?.responseSchema?.properties?.items;
  // Installed clients need the same fast policy for typed meals and photos.
  // Other image tasks and grounded searches retain their reasoning settings.
  if (meal && !payload.tools?.length && !config.thinkingConfig) {
    payload.generationConfig = { ...config, thinkingConfig: { thinkingLevel: 'low' } };
    body = JSON.stringify(payload);
  }

  const started = Date.now();
  const fastMeal = meal && !payload.tools?.length &&
    (!config.thinkingConfig || config.thinkingConfig.thinkingLevel === 'low');
  const attempt = async (selectedModel: string, budgetMs: number): Promise<Response> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abandon: () => void = () => {};
    const canceled = new Promise<Response>((_resolve, reject) => {
      abandon = () => {
        reject(new DOMException('Request canceled', 'AbortError'));
        controller.abort();
      };
      request.signal.addEventListener('abort', abandon, { once: true });
      if (request.signal.aborted) abandon();
    });
    try {
      // Cloud Run does not reliably propagate an end-user disconnect to the
      // container. Bound both response headers and its body here, before its 120s
      // platform timeout. Racing also bounds a transport that ignores abort.
      const deadline = new Promise<Response>((resolve) => {
        timer = setTimeout(() => {
          resolve(Response.json({ error: 'Estimate timed out. Try again or describe the meal.' }, {
            status: 504, headers: { 'x-estimate-timeout': '1' },
          }));
          controller.abort();
        }, budgetMs);
      });
      const relay = async () => {
        const upstream = await fetch(
          `${ENDPOINT}/${selectedModel}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal },
        );
        // The adapter already buffers this response. Reading here keeps a stalled
        // body inside the deadline rather than returning an unbounded stream.
        return new Response(await upstream.arrayBuffer(), {
          status: upstream.status, headers: { 'Content-Type': 'application/json' },
        });
      };
      const response = await Promise.race([canceled, deadline, relay()]);
      console.info(JSON.stringify({ message: 'gemini_request', model: selectedModel, image, status: response.status, elapsedMs: Date.now() - started }));
      return response;
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', abandon);
    }
  };
  const primary = await attempt(model, fastMeal ? 15_000 : image ? 45_000 : 110_000);
  // Some Flash responses stall even with low reasoning. Give interactive meal
  // estimates one bounded alternative, keeping processing below the typed-meal
  // client's 30-second limit. Never retry quota/auth errors or explicit high effort.
  if (fastMeal && !request.signal.aborted && [502, 503, 504].includes(primary.status)) {
    return attempt('gemini-3.5-flash-lite', 12_000);
  }
  return primary;
};
