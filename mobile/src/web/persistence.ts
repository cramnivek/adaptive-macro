/**
 * Browser storage durability.
 *
 * The diary lives in OPFS via expo-sqlite on web, and browsers treat that as
 * evictable by default — measured on a real deployment, `persisted()` returned
 * false. Asking costs one call at startup.
 *
 * On iOS none of this is sufficient on its own: Safari deletes script-writable
 * storage after seven days without use, and only a home-screen install is
 * exempt. Hence the second function.
 */

export const requestPersistentStorage = async (): Promise<
  'persisted' | 'denied' | 'unsupported'
> => {
  try {
    const storage = (globalThis.navigator as any)?.storage;
    if (!storage?.persisted || !storage?.persist) return 'unsupported';
    if (await storage.persisted()) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'denied';
  } catch {
    // Called during startup; a storage API that throws must not stop the app.
    return 'unsupported';
  }
};

/** True when this is iOS in a browser tab, where the diary will be deleted. */
export const needsHomeScreenInstall = (): boolean => {
  try {
    // A browser, not React Native. RN provides a navigator whose userAgent can
    // contain "iPhone" but provides no document, and without this gate the
    // native iOS app would tell the user to Add to Home Screen.
    if (typeof (globalThis as any).document === 'undefined') return false;

    const nav = (globalThis as any).navigator ?? {};
    const ua = nav.userAgent ?? '';
    // iPadOS 13+ reports a desktop Mac user agent; touch points are what
    // separate it from a real Mac. It evicts storage on the same schedule.
    const isIos =
      /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
    if (!isIos) return false;

    // navigator.standalone is the only signal before iOS 16.4, which does not
    // match the display-mode query. Checking one alone nags installed users.
    const installed =
      nav.standalone === true ||
      (globalThis as any).window?.matchMedia?.('(display-mode: standalone)')?.matches === true;
    return !installed;
  } catch {
    return false;
  }
};
