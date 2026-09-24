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
    const ua = (globalThis.navigator as any)?.userAgent ?? '';
    const isIos = /iPhone|iPad|iPod/.test(ua);
    if (!isIos) return false;
    const standalone = (globalThis as any).window?.matchMedia?.('(display-mode: standalone)');
    return !standalone?.matches;
  } catch {
    return false;
  }
};
