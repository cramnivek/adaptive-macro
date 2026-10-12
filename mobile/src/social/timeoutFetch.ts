/**
 * A fetch that gives up.
 *
 * Neither the browser nor React Native puts a short limit on a request, so a
 * post sent on a dying connection could hold the finish sheet — which waits for
 * it before letting anyone leave — for as long as the platform cares to wait.
 * Supabase calls are small; one that has not answered in this long is not going
 * to. A caller that passes its own signal keeps control of its own request.
 */
export const withTimeout =
  (fetchImpl: typeof fetch, ms: number): typeof fetch =>
  (input, init) => {
    if (init?.signal) return fetchImpl(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetchImpl(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
