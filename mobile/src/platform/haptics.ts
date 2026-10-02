import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * A thud, on whichever platform this is.
 *
 * The workout logger fired `Haptics.impactAsync` behind `Platform.OS !== 'web'`,
 * which meant it never fired at all for anyone testing the deployed site —
 * every check of it was silent, and the obvious conclusion was that the phone
 * needed a settings change. It did not.
 *
 * What is actually available:
 *
 * - Native builds get the real thing, with the real intensities.
 * - Android browsers get `navigator.vibrate`, which is a duration and nothing
 *   else — so intensity becomes length, which is the only dial there is.
 * - iOS browsers get nothing. Safari does not implement the Vibration API, so
 *   the iOS PWA cannot buzz however it is asked. That is not a bug to find
 *   later: it needs a native iOS build, and no amount of code here changes it.
 */
export type Strength = 'light' | 'heavy';

/** How long a browser buzzes, since duration is the only control it offers. */
const VIBRATION_MS: Record<Strength, number> = { light: 12, heavy: 30 };

const NATIVE_STYLE: Record<Strength, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export const thud = (strength: Strength): void => {
  if (Platform.OS !== 'web') {
    void Haptics.impactAsync(NATIVE_STYLE[strength]);
    return;
  }

  // Guarded rather than assumed: `vibrate` is absent on iOS Safari and on any
  // desktop browser, and calling it there throws. Chrome also requires a
  // recent user gesture, which a tapped set is.
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(VIBRATION_MS[strength]);
  }
};
