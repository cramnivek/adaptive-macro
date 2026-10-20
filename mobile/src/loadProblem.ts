import { isStorageLockError } from './db/storageLock';

/** One sentence from whatever was thrown, so the screen never shows "[object Object]". */
export const problemText = (error: unknown): string => {
  // The browser's own words for this ("Invalid VFS state") say nothing useful.
  if (isStorageLockError(error)) return 'The app may be open in another tab; close it and try again.';
  const text = error instanceof Error ? error.message.trim() : '';
  if (text === '') return 'Something went wrong with your log on this device.';
  return /[.!?]$/.test(text) ? text : `${text}.`;
};
