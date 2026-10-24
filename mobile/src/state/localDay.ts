import { todayISO, type ISODate } from '@adaptive-macros/engine';

/** Follow a changing local day only while the person was looking at today. */
export const followLocalDay = (selected: ISODate, previous: ISODate, current: ISODate): ISODate =>
  selected === previous ? current : selected;

/**
 * Timers can sleep with the app. `check` also runs on activation, and the
 * minute ceiling notices a timezone or clock change while it stays open.
 * Calendar construction, rather than adding 24 hours, handles DST nights.
 */
export const observeLocalDay = (
  initialDay: ISODate,
  onChange: (previous: ISODate, current: ISODate) => void,
): { check: () => void; stop: () => void } => {
  let day = initialDay;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (stopped) return;
    clearTimeout(timer);
    const now = new Date();
    const current = todayISO(now);
    if (current !== day) {
      const previous = day;
      day = current;
      onChange(previous, current);
    }
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(check, Math.min(60_000, Math.max(1, midnight.getTime() - now.getTime())));
  };
  check();
  return {
    check,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
};

/**
 * React Native defines `global.window = global` without DOM `EventTarget`
 * methods (`window.addEventListener` is `undefined` on Android and iOS).
 * Guard both the global and `addEventListener` so native startup never throws.
 */
export const listenForWebWake = (onWake: () => void): (() => void) => {
  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') onWake();
  };
  const hasDoc =
    typeof document !== 'undefined' && typeof document.addEventListener === 'function';
  const hasWin =
    typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  if (hasDoc) document.addEventListener('visibilitychange', onVisibility);
  if (hasWin) window.addEventListener('focus', onWake);
  return () => {
    if (hasDoc && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
    if (hasWin && typeof window.removeEventListener === 'function') {
      window.removeEventListener('focus', onWake);
    }
  };
};

