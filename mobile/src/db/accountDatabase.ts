import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which database file on this device belongs to whom.
 *
 * The log lives on the device, and it used to be one file whoever was using
 * the app: a second person signing in on the same phone saw the first
 * person's whole history, could post their workouts, and had the first
 * person's body measurements uploaded as their own baseline. Each account now
 * opens a file of its own, and so does using the app without an account, so
 * nobody ever sees a log that is not theirs, and nothing is deleted when
 * someone else signs in.
 *
 * The file that existed before owners were told apart keeps its name and goes
 * to whoever opens the app first after this shipped: the account still signed
 * in, or nobody, for someone who chose to go without one. On a phone used by
 * one person — nearly all of them — that is its owner, who keeps their log
 * without moving anything.
 */

export const LEGACY_DATABASE = 'adaptive-macros.db';

/** The owner standing for whoever uses the app without an account. */
export const SIGNED_OUT = 'signed-out';

const LEGACY_OWNER_KEY = 'ascend_device_database_owner';
const LAST_OWNER_KEY = 'ascend_device_last_owner';

/** An account's user id, or `SIGNED_OUT`. */
export const claimDevice = async (
  owner: string,
): Promise<{ database: string; ownerChanged: boolean }> => {
  const legacyOwner = await AsyncStorage.getItem(LEGACY_OWNER_KEY);
  if (legacyOwner === null) await AsyncStorage.setItem(LEGACY_OWNER_KEY, owner);

  const last = await AsyncStorage.getItem(LAST_OWNER_KEY);
  if (last !== owner) await AsyncStorage.setItem(LAST_OWNER_KEY, owner);

  return {
    database: legacyOwner === null || legacyOwner === owner ? LEGACY_DATABASE : `adaptive-macros-${owner}.db`,
    // Nobody recorded yet means the device-wide caches were written before
    // owners were told apart, by the one now claiming the device, so they are
    // kept rather than throwing away a workout in progress.
    ownerChanged: last !== null && last !== owner,
  };
};
