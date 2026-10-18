import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { activeSession, discardSession, type ActiveSession } from '../db';
import { confirm } from '../dialog';
import { thud } from '../platform/haptics';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Tappable } from './Tappable';

/**
 * Prominently surfaces an in-progress workout on the Today screen.
 * Allows returning users to seamlessly resume interrupted workouts
 * without hunting through the Train tab.
 */
export const ActiveWorkoutBanner = () => {
  const router = useRouter();
  const [session, setSession] = useState<ActiveSession | null>(null);

  const checkActiveSession = useCallback(async () => {
    try {
      const active = await activeSession();
      setSession(active);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    void checkActiveSession();
    // Poll periodically while screen is visible
    const timer = setInterval(() => void checkActiveSession(), 4000);
    return () => clearInterval(timer);
  }, [checkActiveSession]);

  if (!session) return null;

  const handleResume = () => {
    thud('heavy');
    router.push('/session');
  };

  const handleDiscard = async () => {
    const ok = await confirm({
      title: 'Discard session?',
      message: 'Are you sure you want to discard this unfinished workout?',
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (!ok) return;
    thud('light');
    await discardSession(session.id);
    setSession(null);
  };

  const setsCount = session.sets.length;

  return (
    <View style={[styles.banner, { backgroundColor: loud.panel, borderColor: loud.loud }]}>
      <View style={styles.content}>
        <View style={styles.badgeRow}>
          <View style={styles.pulseDot} />
          <Text style={styles.badgeText}>WORKOUT IN PROGRESS</Text>
        </View>

        <Text style={styles.title}>
          {setsCount === 0 ? 'Session active · No sets logged yet' : `${setsCount} set${setsCount === 1 ? '' : 's'} recorded`}
        </Text>
        <Text style={styles.sub}>
          Tap to pick up right where you left off.
        </Text>
      </View>

      <View style={styles.actions}>
        <Tappable
          onPress={handleResume}
          scaleTo={0.96}
          style={[styles.resumeBtn, { backgroundColor: loud.loud }]}
          accessibilityLabel="Resume workout session"
        >
          <Ionicons name="play" size={14} color={loud.onLoud} />
          <Text style={[styles.resumeBtnText, { color: loud.onLoud }]}>RESUME</Text>
        </Tappable>

        <Tappable
          onPress={handleDiscard}
          scaleTo={0.92}
          style={styles.discardBtn}
          accessibilityLabel="Discard active workout"
        >
          <Ionicons name="trash-outline" size={16} color={loud.figureFaint} />
        </Tappable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    marginBottom: space.md,
  },
  content: {
    flex: 1,
    marginRight: space.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: 2,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: '#FF2A4D',
  },
  badgeText: {
    fontFamily: font.figure,
    fontSize: 10,
    letterSpacing: 1,
    color: '#FF2A4D',
    fontWeight: '700',
  },
  title: {
    fontFamily: font.display,
    fontSize: 15,
    color: '#FFFFFF',
    marginTop: 2,
  },
  sub: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs + 2,
    borderRadius: radius.md,
    minHeight: 38,
  },
  resumeBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  discardBtn: {
    padding: space.xs,
    minHeight: 38,
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
