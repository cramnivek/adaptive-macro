import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alerts.
 *
 * React Native Web ships `Alert` as a class whose `alert()` method is an empty
 * function — it does not throw and it does not warn, it just silently does
 * nothing. Every confirmation in the app therefore did nothing on web: a
 * long-press to delete looked broken, and failures reported through an alert
 * vanished entirely.
 *
 * Native alerts are still the right thing on a phone, so this keeps them there
 * and falls back to the browser's own dialogs on web.
 */

interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label for the confirming action. Defaults to "OK". */
  confirmLabel?: string;
  /** Styles the confirm action as destructive on native. */
  destructive?: boolean;
}

/** Resolves true when the user confirms, false when they cancel or dismiss. */
export const confirm = ({
  title,
  message,
  confirmLabel = 'OK',
  destructive = false,
}: ConfirmOptions): Promise<boolean> => {
  if (Platform.OS === 'web') {
    // `window.confirm` is synchronous and blocks the page, but it is the only
    // dialog a browser offers without building one, and these are rare
    // deliberate actions rather than anything on a hot path.
    const combined = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(combined)
        : false,
    );
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
};

export interface Notice {
  title: string;
  message?: string;
  /** Distinguishes two identical notices, so the second still restarts the clock. */
  at: number;
}

type NoticeListener = (notice: Notice) => void;
let listener: NoticeListener | null = null;

/**
 * Registers the one thing that draws notices. Returns its unsubscribe.
 *
 * A single slot rather than a set: there is one `Toaster`, mounted at the root,
 * and a second subscriber would mean every notice drawn twice.
 */
export const subscribeToNotices = (next: NoticeListener): (() => void) => {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
};

/**
 * Says something, without taking the screen hostage to do it.
 *
 * This was `window.alert` on web, which puts the Cloud Run hostname above every
 * message — "gemini-proxy-297164004726.asia-southeast1.run.app says" — so a
 * saved workout read like a system error. It also blocks the page until
 * dismissed, which is how one stray notice freezes everything behind it.
 *
 * Falls back to the dialog when nothing is listening: a notice raised before
 * the tree has mounted is still worth seeing.
 */
export const notify = (title: string, message?: string): void => {
  if (listener !== null) {
    listener({ title, message, at: Date.now() });
    return;
  }
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
};
