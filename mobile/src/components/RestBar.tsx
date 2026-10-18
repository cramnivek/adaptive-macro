import Ionicons from '@expo/vector-icons/Ionicons';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { formatRest } from '../rest';
import type { AppPersonality } from '../state/settings';
import { getEventCopy } from '../copy/personality';
import { font, radius, space } from '../theme';
import { useAnimatedTo } from '../theme/motion';
import { session as loud } from '../theme/sessionTheme';
import { Tappable } from './Tappable';

interface RestBarProps {
  /** Seconds left, or 0 once the rest is up. */
  remaining: number;
  /** What the countdown started from, for the width of the fill. */
  total: number;
  onAdjust: (steps: number) => void;
  onSkip: () => void;
  /** Whether the end of the rest chimes, and the switch for it. */
  soundOn: boolean;
  onToggleSound: () => void;
  /** Personality voice preference */
  personality?: AppPersonality;
}

/**
 * The rest between sets.
 *
 * Starts itself when a set is ticked, because the alternative is tapping
 * "start rest" after every single one, and nobody does that twice.
 *
 * The bar drains rather than fills: at a glance the remaining colour *is* the
 * remaining time, with no arithmetic. At zero it inverts and says so, which
 * matters more than it sounds — on the iOS PWA there is no vibration API at
 * all, so for those users this is the only signal the rest is up.
 */
export const RestBar = ({
  remaining,
  total,
  onAdjust,
  onSkip,
  soundOn,
  onToggleSound,
  personality,
}: RestBarProps) => {
  const done = remaining <= 0;
  const fraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const width = useAnimatedTo(fraction);

  return (
    <View style={[styles.wrap, done ? styles.wrapDone : styles.wrapResting]}>
      {!done && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.fill,
            { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      )}

      <View style={styles.content} pointerEvents="box-none">
        <Tappable
          onPress={onToggleSound}
          scaleTo={0.85}
          style={styles.bell}
          accessibilityRole="switch"
          accessibilityState={{ checked: soundOn }}
          accessibilityLabel={soundOn ? 'Rest chime on' : 'Rest chime off'}
        >
          <Ionicons
            name={soundOn ? 'notifications' : 'notifications-off-outline'}
            size={16}
            color={done ? loud.onLoud : soundOn ? loud.figure : loud.figureFaint}
          />
        </Tappable>
        <Text style={[styles.label, { color: done ? loud.onLoud : loud.figureFaint }]}>
          {done
            ? getEventCopy('workout.rest_done_label', { personality, seed: total })
            : getEventCopy('workout.rest_resting_label', { personality, seed: total })}
        </Text>

        <Text style={[styles.clock, { color: done ? loud.onLoud : loud.figure }]}>
          {formatRest(remaining)}
        </Text>

        <View style={styles.actions}>
          {/*
            Adjusting mid-rest changes the stored default too. Someone reaching
            for +15 is telling you the default is wrong, not that this one set
            was unusual.
          */}
          <Tappable
            onPress={() => onAdjust(-1)}
            scaleTo={0.85}
            style={styles.step}
            accessibilityLabel="Fifteen seconds less rest"
          >
            <Text style={[styles.stepLabel, { color: done ? loud.onLoud : loud.figure }]}>−15</Text>
          </Tappable>
          <Tappable
            onPress={() => onAdjust(1)}
            scaleTo={0.85}
            style={styles.step}
            accessibilityLabel="Fifteen seconds more rest"
          >
            <Text style={[styles.stepLabel, { color: done ? loud.onLoud : loud.figure }]}>+15</Text>
          </Tappable>
          <Tappable
            onPress={onSkip}
            scaleTo={0.85}
            style={styles.step}
            accessibilityLabel={done ? 'Dismiss' : 'Skip the rest of this rest'}
          >
            <Text style={[styles.stepLabel, { color: done ? loud.onLoud : loud.figureMuted }]}>
              {done ? getEventCopy('workout.rest_done_btn', { personality, seed: total }) : 'SKIP'}
            </Text>
          </Tappable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bell: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  wrap: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.md,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  wrapResting: { backgroundColor: loud.panel, borderColor: loud.rule },
  wrapDone: { backgroundColor: loud.loud, borderColor: loud.loud },
  // Sits behind the content and shrinks to nothing as the rest runs out.
  fill: { right: undefined, backgroundColor: 'rgba(232,53,42,0.28)' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  label: { fontFamily: font.display, fontSize: 10, letterSpacing: 1.6 },
  clock: {
    fontFamily: font.figure,
    fontSize: 20,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  actions: { flexDirection: 'row', gap: 4 },
  step: {
    minWidth: 40,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  stepLabel: { fontFamily: font.display, fontSize: 11, letterSpacing: 0.8 },
});
