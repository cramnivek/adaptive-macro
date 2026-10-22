import AsyncStorage from '@react-native-async-storage/async-storage';
import { confirm } from '../dialog';
import { hasLog, isEmptyLog, signedOutDatabase } from './accountDatabase';
import { describeBackup, exportBackup, restoreBackup, selectDatabase, type Backup } from './index';

/**
 * Offers to move the log kept without an account into the account signing in.
 *
 * Each account has a log of its own, and the one kept without an account is
 * separate, so nobody sees a log that is not theirs (accountDatabase.ts). The
 * cost: someone who used the app signed out, or whose session had lapsed when
 * that change shipped, signed in to an empty log. Nothing was lost, but it
 * looked lost, and the only way back was a backup and a restore.
 *
 * So when an account opens a log with nothing in it and this device holds a
 * log from before, the person is asked once whether to move it in. Moved, not
 * copied: it leaves the signed-out log, so it is not on show to whoever next
 * uses the app without signing in. "Not now" is remembered for that account.
 *
 * Runs with the account's file selected and leaves it selected.
 */

const PENDING_CLEAR_KEY = 'ascend_move_log_pending_clear';

const declinedKey = (userId: string) => `ascend_move_log_declined_${userId}`;

const EMPTY = (): Backup => ({
  version: 2,
  exportedAt: new Date().toISOString(),
  settings: [],
  weights: [],
  foods: [],
  entries: [],
});

export const offerToMoveLog = async (userId: string, accountDatabase: string): Promise<void> => {
  const source = await signedOutDatabase();
  if (source === accountDatabase) return;
  if ((await AsyncStorage.getItem(declinedKey(userId))) !== null) return;
  // Empty means nothing at all, settings included: the move restores over the
  // whole log, so an account holding even a custom food is left alone.
  if (!isEmptyLog(await exportBackup())) return;

  await selectDatabase(source);
  let earlier: Backup;
  try {
    earlier = await exportBackup();
  } finally {
    await selectDatabase(accountDatabase);
  }
  const counts = describeBackup(earlier);
  if (!hasLog(counts)) return;

  const move = await confirm({
    title: 'Move your earlier log into this account?',
    message:
      `This device has a log from before you signed in: ${counts.weights} weigh-ins, ` +
      `${counts.measurements} body measurements, ${counts.entries} diary entries and ${counts.sessions} workouts. ` +
      'Moved into your account, it follows you, and no longer shows to anyone using the app without signing in.',
    confirmLabel: 'Move it in',
    cancelLabel: 'Not now',
  });
  if (!move) {
    await AsyncStorage.setItem(declinedKey(userId), new Date().toISOString());
    return;
  }

  // Into the account first: if anything fails after this, the log exists in
  // both places, never in neither. The clear still owed is written down
  // before it is attempted, so a failure is finished on the next launch
  // instead of leaving the copy on show to anyone signed out.
  await restoreBackup(earlier);
  await AsyncStorage.setItem(PENDING_CLEAR_KEY, source);
  await finishPendingMove(accountDatabase);
};

/**
 * Clears the old copy of a moved log, if a move left that owed. Run on every
 * launch, for whoever is using the app, before any log is shown. Leaves
 * `current` selected.
 */
export const finishPendingMove = async (current: string): Promise<void> => {
  const pending = await AsyncStorage.getItem(PENDING_CLEAR_KEY);
  if (pending === null) return;
  await selectDatabase(pending);
  try {
    await restoreBackup(EMPTY());
    await AsyncStorage.removeItem(PENDING_CLEAR_KEY);
  } finally {
    await selectDatabase(current);
  }
};
