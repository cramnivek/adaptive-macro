import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useApp } from '../state/AppStore';
import { syncHealthConnectIfDue } from './healthConnect';

/**
 * Keeps steps and weigh-ins current without a trip to the Account screen.
 *
 * A sync used to happen only on a tap there, so Today showed yesterday's
 * steps until someone remembered to go and press it. Now the app syncs when it
 * opens, when it comes back to the front, and every quarter of an hour while
 * it stays open, whenever Health Connect is connected and the last sync is old
 * enough (see syncHealthConnectIfDue). Silent: a sync nobody asked for should
 * not interrupt, and a failed one is tried again next time.
 *
 * It can only be as fresh as Health Connect is. Garmin moves data from the
 * watch to its app and on to Health Connect on its own schedule.
 */
export const useHealthConnectAutoSync = () => {
  const { refreshAll } = useApp();
  // Read through a ref: refreshAll changes with the day on screen, and the
  // listeners and timer should be set up once, not again on every date change.
  const refresh = useRef(refreshAll);
  refresh.current = refreshAll;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const run = () => {
      void syncHealthConnectIfDue()
        .then((result) => (result ? refresh.current() : undefined))
        .catch(() => undefined);
    };
    run();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    // Checked every minute, synced only when a quarter of an hour has passed.
    const timer = setInterval(run, 60 * 1000);
    return () => {
      appState.remove();
      clearInterval(timer);
    };
  }, []);
};
