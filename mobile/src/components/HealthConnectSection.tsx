import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { openHealthConnectSettings } from 'react-native-health-connect';
import { notify } from '../dialog';
import {
  connectHealthConnect,
  healthConnectState,
  lastHealthConnectSync,
  onHealthConnectSynced,
  syncHealthConnect,
  requestSleepAccess,
  sleepAccessGranted,
  type HealthConnectState,
  type LastHealthConnectSync,
} from '../health/healthConnect';
import { describeSync } from '../health/healthConnectRules';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Button } from './Controls';

/**
 * Connects to Health Connect and brings steps and weigh-ins in, on Android.
 *
 * Nothing is drawn where Health Connect cannot run, so the web app and iPhone
 * keep the hand-entry card they had. A sync says what it found, what it added
 * and where to look, and the last one stays written under the button: a
 * notice lasts seconds, and the app also syncs by itself, out of sight.
 */
export const HealthConnectSection = () => {
  const { colors } = useTheme();
  const { refreshAll } = useApp();
  const [state, setState] = useState<HealthConnectState | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastHealthConnectSync | null>(null);
  const [sleepAccess, setSleepAccess] = useState<'checking' | 'allowed' | 'not-allowed' | 'unavailable'>('checking');

  useEffect(() => {
    let alive = true;
    const refreshPermissions = () => {
      void healthConnectState().then((value) => { if (alive) setState(value); });
      void sleepAccessGranted()
        .then((allowed) => { if (alive) setSleepAccess(allowed ? 'allowed' : 'not-allowed'); })
        .catch(() => { if (alive) setSleepAccess('unavailable'); });
    };
    refreshPermissions();
    void lastHealthConnectSync().then((value) => { if (alive) setLast(value); });
    const stopSync = onHealthConnectSynced((value) => { setLast(value); refreshPermissions(); });
    const subscription = AppState.addEventListener('change', (value) => { if (value === 'active') refreshPermissions(); });
    return () => { alive = false; stopSync(); subscription.remove(); };
  }, []);

  const sync = useCallback(async () => {
    setBusy(true);
    try {
      const result = await syncHealthConnect();
      await refreshAll();
      const { title, message } = describeSync(result);
      notify(title, message);
    } catch (error) {
      notify('Sync failed', (error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [refreshAll]);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      if (await connectHealthConnect()) {
        setState('connected');
        setBusy(false);
        await sync();
      } else {
        notify('Not connected', 'Health Connect did not grant access to steps, weight or sleep.');
      }
    } catch (error) {
      notify('Could not connect', (error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [sync]);

  const enableSleep = async () => {
    setBusy(true);
    try {
      if (await requestSleepAccess()) {
        setSleepAccess('allowed');
        await sync();
      } else {
        setSleepAccess('not-allowed');
        notify('Sleep not enabled', 'Sleep permission was not granted. Open Health Connect settings; if Sleep is missing for Ascend, install the updated Android build.');
      }
    } catch {
      notify('Sleep not enabled', 'The installed Android build must include sleep permission. Open Health Connect settings; if Sleep is missing for Ascend, update the app.');
    } finally {
      setBusy(false);
    }
  };

  if (state === null || state === 'unsupported') return null;

  const lastLine =
    state === 'connected' && last
      ? `Last synced ${new Date(last.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. ${describeSync(last.result).message}`
      : null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        {state === 'connected'
          ? 'Reads the steps, weigh-ins and optional sleep you allow from Health Connect, where Garmin Connect and other apps share theirs. Syncs when the app opens and every 15 minutes while open. Weigh-ins entered yourself are never replaced. Sleep stays on this phone and appears on Today; it does not change your calorie target.'
          : state === 'needs-update'
            ? 'Health Connect needs an update from the Play Store before Ascend can read from it.'
            : 'Bring in steps, weigh-ins and optional sleep from Health Connect, where Garmin Connect and other apps share theirs. You choose each permission; steps and weight still work without sleep. Read only; it stays on this phone.'}
      </Text>
      <Text style={[styles.last, { color: colors.text }]}>
        {sleepAccess === 'allowed' ? 'Sleep access: allowed'
          : sleepAccess === 'checking' ? 'Checking sleep access…'
            : sleepAccess === 'unavailable' ? 'Sleep access status unavailable'
              : 'Sleep access: not allowed'}
      </Text>
      {sleepAccess !== 'allowed' && sleepAccess !== 'checking' && (
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Sleep needs an Android build that includes its permission. If Sleep is not listed for Ascend in Health Connect, update Ascend first. Garmin must also share sleep into Health Connect.
        </Text>
      )}
      {state === 'needs-update' ? (
        <Button
          label="Update Health Connect"
          variant="subtle"
          onPress={() => void Linking.openURL('market://details?id=com.google.android.apps.healthdata')}
        />
      ) : state === 'connected' ? (
        <View style={{ gap: space.sm }}>
          <Button label={busy ? 'Syncing…' : 'Sync now'} onPress={() => void sync()} disabled={busy} />
          {sleepAccess !== 'allowed' && <Button label="Request sleep access" variant="subtle" onPress={() => void enableSleep()} disabled={busy} />}
          <Button label="Open Health Connect settings" variant="subtle" onPress={() => {
            try { openHealthConnectSettings(); }
            catch { notify('Could not open settings', 'Open Health Connect from Android Settings to review Ascend permissions.'); }
          }} disabled={busy} />
        </View>
      ) : (
        <Button label={busy ? 'Connecting…' : 'Connect Health Connect'} onPress={() => void connect()} disabled={busy} />
      )}
      {lastLine && <Text style={[styles.last, { color: colors.textFaint }]}>{lastLine}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginBottom: space.sm },
  note: { fontFamily: font.ui, fontSize: 13, lineHeight: 18 },
  last: { fontFamily: font.ui, fontSize: 12, lineHeight: 17 },
});
