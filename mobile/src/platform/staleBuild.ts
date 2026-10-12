/**
 * Recovering a page left open across a deploy.
 *
 * The web build loads some code only when it is first needed (the Gemini meal
 * estimate, the local model). Each deploy replaces those files with new ones
 * under new names, so a page opened before the deploy — an installed iPhone app
 * that stayed in memory, say — asks for a file that no longer exists and the
 * feature fails with "Loading module … failed". Reloading picks up the new build,
 * which is what anyone would do by hand once they knew to.
 */

const RELOADED_AT = 'ascend.staleBuildReloadAt';
/** Within this long of the last reload, a second failure is real, not staleness. */
const RELOAD_WINDOW_MS = 60_000;

export const isStaleChunkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return /Loading module .* failed|Failed to fetch dynamically imported module|Importing a module script failed/.test(
    error.message,
  );
};

export const shouldReload = (lastReloadAt: number | null, now: number): boolean =>
  lastReloadAt === null || now - lastReloadAt > RELOAD_WINDOW_MS;

/**
 * Loads code that is split into its own file. On the web, a load that fails
 * because the file is from an older deploy reloads the page once; if it fails
 * again straight after, the error is real and is passed on in plain words.
 */
export const loadFresh = async <T>(load: () => Promise<T>): Promise<T> => {
  try {
    return await load();
  } catch (error) {
    // Only a browser has a page to reload; native builds have no split files to go stale.
    // Checked this way rather than through react-native, so the module stays importable
    // by the plain-Node tests of everything that uses it.
    const browser = typeof window !== 'undefined' && typeof window.location?.reload === 'function';
    if (!browser || !isStaleChunkError(error)) throw error;
    let last: number | null = null;
    try {
      const stored = window.sessionStorage.getItem(RELOADED_AT);
      last = stored === null ? null : Number(stored);
    } catch {
      // Storage can be unavailable (private browsing); reloading still helps once.
    }
    if (shouldReload(last, Date.now())) {
      try {
        window.sessionStorage.setItem(RELOADED_AT, String(Date.now()));
      } catch {
        // As above.
      }
      window.location.reload();
      // The page is going away; nothing should act on this promise.
      return new Promise<T>(() => undefined);
    }
    throw new Error('Ascend was updated. Close the app completely and open it again.');
  }
};
