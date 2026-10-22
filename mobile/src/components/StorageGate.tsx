import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { isStorageLockError } from '../db/storageLock';
import { releaseSplash } from '../platform/splash';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Button } from './Controls';

/**
 * What to show when the database could not be opened, instead of an empty app.
 *
 * The failure this exists for used to render every screen with its empty
 * defaults: no weigh-ins, no diary, no workouts. That is the single worst way
 * a tracker can fail, because it reads as "everything I logged is gone" when
 * nothing is — the data sat untouched on disk the whole time.
 *
 * So the first thing it says is that the data is safe, and the second is what
 * to do. By the time this appears the open has already waited out the usual
 * cause, so what remains is nearly always a second tab holding the database.
 */
export const StorageGate = ({ children }: { children: React.ReactNode }) => {
  const { loadError, retryLoad } = useApp();
  const { colors } = useTheme();

  // The first screen never comes when the log cannot be opened, so this one
  // releases the launch screen instead of leaving the app behind it.
  useEffect(() => {
    if (loadError !== null) releaseSplash();
  }, [loadError]);

  if (loadError === null) return <>{children}</>;

  const locked = isStorageLockError(loadError);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Your data is safe.</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {locked
          ? 'The app could not open its storage, because it is already open somewhere else — usually another tab or window of this app. Close the others, then try again.'
          : 'The app could not open its storage. Nothing has been deleted; it just could not be read this time.'}
      </Text>
      <Button
        label="Try again"
        onPress={() => {
          // On web a reload is the dependable way to drop a stale worker, which
          // is what holds the lock. Natively there is no worker to drop.
          if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
          else retryLoad();
        }}
      />
      <Text style={[styles.detail, { color: colors.textFaint }]}>{loadError.message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md },
  title: { fontFamily: font.display, fontSize: 24 },
  body: { fontFamily: font.ui, fontSize: 15, lineHeight: 22 },
  // The raw message, small, for the one person who needs to report it.
  detail: { fontFamily: font.figure, fontSize: 11, lineHeight: 16 },
});
