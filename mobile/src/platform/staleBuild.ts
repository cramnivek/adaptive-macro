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

/**
 * The entry bundle a page of the web build loads, e.g.
 * "_expo/static/js/web/entry-ad5c….js". Each deploy gives it a new name, so it
 * identifies the build. Null in development, where there is no such file.
 */
export const entryBundleIn = (html: string): string | null =>
  html.match(/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/)?.[0] ?? null;

/**
 * How long the app must have been out of sight before coming back may reload
 * it. A quick switch away (to copy a caption, answer a message) leaves the
 * page alone, so nothing half-typed is lost; after this long, a fresh start is
 * what reopening an app looks like anyway.
 */
export const AWAY_BEFORE_RELOAD_MS = 5 * 60_000;

/**
 * Keeps an installed web app on the current build.
 *
 * An installed app kept in memory never reloads the page, and the server keeps
 * every earlier build's files so that a page left open keeps working, so a
 * phone could run a build from hours or days before without any sign of it:
 * the owner saw Settings sections a day after they were removed. When the app
 * comes back into view after a while, this asks the server which build it now
 * serves and reloads if it is a different one. Everything is on the device and
 * a workout in progress is saved as it is typed, so a reload costs nothing.
 *
 * Returns the function that stops watching. Does nothing outside a browser or
 * in development.
 */
export const watchForNewBuild = (): (() => void) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined;
  const loaded = entryBundleIn(
    [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src') ?? '').join(' '),
  );
  if (loaded === null) return () => undefined;

  let hiddenAt: number | null = null;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (away < AWAY_BEFORE_RELOAD_MS) return;
    fetch('/', { cache: 'no-store' })
      .then((response) => response.text())
      .then((html) => {
        const served = entryBundleIn(html);
        if (served === null || served === loaded) return;
        // The same guard as a stale file: never reload twice in a minute.
        let last: number | null = null;
        try {
          const stored = window.sessionStorage.getItem(RELOADED_AT);
          last = stored === null ? null : Number(stored);
        } catch {
          // Unavailable storage only loses the loop guard.
        }
        if (!shouldReload(last, Date.now())) return;
        try {
          window.sessionStorage.setItem(RELOADED_AT, String(Date.now()));
        } catch {
          // As above.
        }
        window.location.reload();
      })
      // Offline or the server unreachable: stay on the build that works.
      .catch(() => undefined);
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
};
