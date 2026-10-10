/**
 * The browser's storage lock, and how long to wait it out.
 *
 * On web, SQLite lives in OPFS behind a sync access handle, and a file can
 * have exactly one. A page that reloads — or simply navigates — can start
 * opening the database while the previous page's worker still holds that
 * handle, and the open fails with `Invalid VFS state` or the underlying
 * `NoModificationAllowedError`. Watching it happen, the old handle lets go
 * within about a second.
 *
 * Nothing used to wait for that. The store's first load had no error path, so
 * the failure surfaced as an empty app — no weigh-ins, no diary, no workouts —
 * which is indistinguishable from having lost everything. The data was always
 * fine; the app just asked for it a moment too early, once, and gave up.
 */

/**
 * Backoff between attempts, a little under four seconds in all.
 *
 * Long enough to outlast a reload's overlap. Not long enough to hide a genuine
 * conflict — a second tab holding the database open will not let go, and the
 * person needs telling that rather than a spinner that never resolves.
 */
export const STORAGE_LOCK_RETRY_MS = [250, 500, 1000, 2000];

/** Whether an error is the storage being held, as opposed to anything else. */
export const isStorageLockError = (error: unknown): boolean => {
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : typeof error === 'string' ? error : '';
  return /Invalid VFS state|NoModificationAllowedError|createSyncAccessHandle/i.test(text);
};
