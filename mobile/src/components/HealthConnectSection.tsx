import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { notify } from '../dialog';
import {
  connectHealthConnect,
  healthConnectState,
  syncHealthConnect,
  type HealthConnectState,
} from '../health/healthConnect';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Button } from './Controls';

/**
 * Connects to Health Connect and brings steps and weigh-ins in, on Android.
 *
 * Nothing is drawn where Health Connect cannot run, so the web app and iPhone
 * keep the hand-entry card they had. A sync says what it did in numbers,
 * including the weigh-ins it left alone, because a weigh-in that silently did
 * not arrive reads as the sync being broken.
 */
export const HealthConnectSection = () => {
  const { colors } = useTheme();
  const { refreshAll } = useApp();
  const [state, setState] = useState<HealthConnectState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void healthConnectState().then(setState);
  }, []);

  const sync = useCallback(async () => {
    setBusy(true);
    try {
      const result = await syncHealthConnect();
      await refreshAll();
      const kept = result.weighInsKept > 0 ? ` ${result.weighInsKept} days already had a weigh-in and kept it.` : '';
      notify('Health Connect synced', `${result.weighIns} weigh-ins and ${result.stepDays} days of steps.${kept}`);
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

  return (
    <View style={styles.wrap}>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        {state === 'connected'
          ? 'Reading steps and weigh-ins from Health Connect, where Garmin Connect and other apps share theirs. Weigh-ins you entered yourself are never replaced.'
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
        <Button label={busy ? 'Syncing…' : 'Sync from Health Connect'} onPress={() => void sync()} disabled={busy} />
      ) : (
        <Button label={busy ? 'Connecting…' : 'Connect Health Connect'} onPress={() => void connect()} disabled={busy} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginBottom: space.sm },
  note: { fontFamily: font.ui, fontSize: 13, lineHeight: 18 },
});
