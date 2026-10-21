import * as SplashScreen from 'expo-splash-screen';

/**
 * Keeps the launch screen up until there is something to show.
 *
 * Android draws the icon on the app's background from the first frame; left
 * to itself it then went away at once, and the phone showed an empty page
 * while fonts and the log loaded before anything appeared. Held until the
 * first screen is ready, the launch screen hands straight to the arrival fade.
 *
 * Released in every way the app can come up — the first screen, the storage
 * error, and a timeout behind both — because a launch screen that never goes
 * away is a far worse failure than a moment of empty page.
 */

const LONGEST_HOLD_MS = 8000;
let released = false;

export const holdSplash = (): void => {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
  setTimeout(releaseSplash, LONGEST_HOLD_MS);
};

export const releaseSplash = (): void => {
  if (released) return;
  released = true;
  void SplashScreen.hideAsync().catch(() => undefined);
};
