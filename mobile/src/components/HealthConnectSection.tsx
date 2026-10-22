import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { notify } from '../dialog';
import {
  connectHealthConnect,
  healthConnectState,
  lastHealthConnectSync,
  onHealthConnectSynced,
  syncHealthConnect,
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

  useEffect(() => {
    void healthConnectState().then(setState);
    void lastHealthConnectSync().then(setLast);
    return onHealthConnectSynced(setLast);
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
        notify('Not connected', 'Health Connect did not grant access to steps or weight.');
      }
    } catch (error) {
      notify('Could not connect', (error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [sync]);

  if (state === null || state === 'unsupported') return null;

  const lastLine =
    state === 'connected' && last
      ? `Last synced ${new Date(last.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. ${describeSync(last.result).message}`
      : null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        {state === 'connected'
          ? 'Reading steps and weigh-ins from Health Connect, where Garmin Connect and other apps share theirs. Syncs by itself when the app opens and every 15 minutes while it is open. Weigh-ins you entered yourself are never replaced.'
          : state === 'needs-update'
            ? 'Health Connect needs an update from the Play Store before Ascend can read from it.'
            : 'Bring in steps and weigh-ins from Health Connect, where Garmin Connect and other apps share theirs. Read only; it stays on this phone.'}
      </Text>
      {state === 'needs-update' ? (
        <Button
          label="Update Health Connect"
          variant="subtle"
          onPress={() => void Linking.openURL('market://details?id=com.google.android.apps.healthdata')}
        />
      ) : state === 'connected' ? (
        <Button label={busy ? 'Syncing…' : 'Sync now'} onPress={() => void sync()} disabled={busy} />
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
