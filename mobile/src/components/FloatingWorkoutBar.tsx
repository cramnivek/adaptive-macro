import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { createContext, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { thud } from '../platform/haptics';
import {
  adjustRestCountdown,
  clearRestCountdown,
  subscribeActiveWorkout,
  syncActiveSessionFromDb,
  type ActiveWorkoutState,
} from '../state/activeWorkoutStore';
import { font, radius, space, useTheme } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Tappable } from './Tappable';

/**
 * How much of the bottom of a tab the bar covers, in points; 0 while it is
 * hidden. The bar floats over every tab, and without this the last thing on
 * each one (the newest weigh-ins, the end of a list) sat behind it with no way
 * to scroll it clear. `Screen` adds it to its bottom padding.
 */
export const FloatingBarInset = createContext(0);

export const FloatingWorkoutBar = ({ onHeight }: { onHeight?: (points: number) => void }) => {
  const router = useRouter();
  const { colors } = useTheme();
  const [workoutState, setWorkoutState] = useState<ActiveWorkoutState | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void syncActiveSessionFromDb();
    const unsub = subscribeActiveWorkout(setWorkoutState);
    const poller = setInterval(() => {
      void syncActiveSessionFromDb();
    }, 4000);
    return () => {
      unsub();
      clearInterval(poller);
    };
  }, []);

  // Timer tick effect when rest is active
  useEffect(() => {
    if (!workoutState?.rest) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, [workoutState?.rest]);

  const shown = !!workoutState?.hasActiveSession;
  useEffect(() => {
    if (!shown) onHeight?.(0);
  }, [shown, onHeight]);

  if (!shown) {
    return null;
  }

  const handleResume = () => {
    thud('heavy');
    router.push('/session');
  };

  const handleAdd30s = () => {
    thud('light');
    adjustRestCountdown(30);
  };

  const handleSkipRest = () => {
    thud('light');
    clearRestCountdown();
  };

  // Rest countdown calculation
  let restRemaining: number | null = null;
  if (workoutState.rest) {
    restRemaining = Math.max(0, Math.round((workoutState.rest.endsAt - now) / 1000));
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const isResting = restRemaining !== null && restRemaining > 0;
  const isRestDone = restRemaining === 0;

  return (
    <View
      style={styles.wrapper}
      // The bar's own height plus the gap it keeps above the tab bar's edge.
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height + space.sm)}
    >
      <Pressable
        onPress={handleResume}
        style={[
          styles.container,
          {
            backgroundColor: loud.panel,
            borderColor: isResting ? colors.accent : loud.loud,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Active workout bar, tap to resume"
      >
        {/* Left side: Live indicator and Workout / Rest metadata */}
        <View style={styles.left}>
          <View style={[styles.pulseCircle, { backgroundColor: isResting ? colors.accent + '25' : loud.loud + '25' }]}>
            <View
              style={[
                styles.pulseDot,
                { backgroundColor: isRestDone ? colors.positive : isResting ? colors.accent : loud.loud },
              ]}
            />
          </View>

          <View style={styles.metaWrap}>
            <View style={styles.topRow}>
              <Text style={[styles.sessionName, { color: loud.figure }]} numberOfLines={1}>
                {workoutState.currentExerciseName || workoutState.sessionName || 'Active Workout'}
              </Text>
            </View>

            <View style={styles.bottomRow}>
              {isResting ? (
                <View style={styles.restBadge}>
                  <Ionicons name="timer-outline" size={13} color={colors.accent} />
                  <Text style={[styles.restTimeText, { color: colors.accent }]}>
                    REST {formatTime(restRemaining!)}
                  </Text>
                </View>
              ) : isRestDone ? (
                <View style={styles.readyBadge}>
                  <Text style={[styles.readyText, { color: colors.positive }]}>READY TO LIFT 💥</Text>
                </View>
              ) : (
                <Text style={[styles.setsSub, { color: loud.figureMuted }]}>
                  {workoutState.setsCount} set{workoutState.setsCount === 1 ? '' : 's'} logged · Tap to resume
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Right side: Quick actions or Resume button */}
        <View style={styles.actions}>
          {isResting && (
            <>
              <Tappable
                onPress={handleAdd30s}
                style={[styles.miniBtn, { borderColor: loud.rule }]}
                scaleTo={0.92}
                accessibilityLabel="Add 30 seconds to rest timer"
              >
                <Text style={[styles.miniBtnText, { color: loud.figure }]}>+30s</Text>
              </Tappable>
              <Tappable
                onPress={handleSkipRest}
                style={[styles.miniBtn, { borderColor: loud.rule }]}
                scaleTo={0.92}
                accessibilityLabel="Skip rest timer"
              >
                <Ionicons name="play-skip-forward" size={12} color={loud.figureMuted} />
              </Tappable>
            </>
          )}

          <Tappable
            onPress={handleResume}
            style={[styles.resumeBtn, { backgroundColor: loud.loud }]}
            scaleTo={0.94}
            accessibilityLabel="Resume workout"
          >
            <Ionicons name="play" size={13} color={loud.onLoud} />
            <Text style={[styles.resumeText, { color: loud.onLoud }]}>RESUME</Text>
          </Tappable>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: Platform.OS === 'web' ? 58 : 54,
    zIndex: 999,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
    marginRight: space.xs,
  },
  pulseCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  metaWrap: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionName: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  restBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  restTimeText: {
    fontFamily: font.figure,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  readyBadge: {
    paddingVertical: 1,
  },
  readyText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  setsSub: {
    fontFamily: font.ui,
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniBtn: {
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBtnText: {
    fontFamily: font.figure,
    fontSize: 11,
    fontWeight: '600',
  },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
  resumeText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
