import { describe, expect, it } from 'vitest';
import { STORAGE_LOCK_RETRY_MS, isStorageLockError } from '../storageLock';

describe('isStorageLockError', () => {
  it('recognises the message expo-sqlite surfaces', () => {
    expect(isStorageLockError(new Error('Invalid VFS state'))).toBe(true);
  });

  it('recognises the browser error underneath it', () => {
    // As seen in this app's own dev overlay, verbatim.
    const error = new Error(
      "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles " +
        'cannot be created if there is another open Access Handle or Writable stream ' +
        'associated with the same file.',
    );
    error.name = 'NoModificationAllowedError';
    expect(isStorageLockError(error)).toBe(true);
  });

  it('does not mistake an ordinary failure for the lock', () => {
    // Retrying a syntax error or a constraint violation would just delay the
    // real message by four seconds.
    expect(isStorageLockError(new Error('near "SELEC": syntax error'))).toBe(false);
    expect(isStorageLockError(new Error('UNIQUE constraint failed: foods.id'))).toBe(false);
  });

  it('copes with things thrown that are not errors', () => {
    expect(isStorageLockError('Invalid VFS state')).toBe(true);
    expect(isStorageLockError(undefined)).toBe(false);
    expect(isStorageLockError({ message: 'Invalid VFS state' })).toBe(false);
  });
});

describe('STORAGE_LOCK_RETRY_MS', () => {
  it('backs off rather than hammering the lock', () => {
    for (let i = 1; i < STORAGE_LOCK_RETRY_MS.length; i += 1) {
      expect(STORAGE_LOCK_RETRY_MS[i]).toBeGreaterThan(STORAGE_LOCK_RETRY_MS[i - 1] ?? 0);
    }
  });

  it('gives up in seconds, so a second tab is reported rather than waited on forever', () => {
    const total = STORAGE_LOCK_RETRY_MS.reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeGreaterThanOrEqual(1000);
    expect(total).toBeLessThanOrEqual(5000);
  });
});
