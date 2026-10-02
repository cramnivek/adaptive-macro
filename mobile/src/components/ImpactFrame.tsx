import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { font } from '../theme';
import { ease, exit, impact } from '../theme/motion';
import { SKEW, session } from '../theme/sessionTheme';
import type { ImpactContent } from './setImpact';

// Named `ImpactFrame` rather than `SetImpact`: on a case-insensitive filesystem
// TypeScript treats `SetImpact.tsx` and the pure `setImpact.ts` beside it as
// the same module and refuses to compile either. Same trap as muscleMap.

/**
 * Timings, in one place.
 *
 * Full-screen drama on every tick is excellent on set three and wearing by set
 * forty, and this screen is used forty times in an hour. These live together
 * so tuning the whole thing down after a real session is one edit rather than
 * a hunt through an animation graph. Total is a little over 400ms.
 */
const TIMING = {
  /** Panel crossing in from the left. */
  arrive: 140,
  /** The figure landing, started while the panel is still moving. */
  popDelay: 60,
  pop: 160,
  /** How long it sits there once everything has landed. */
  hold: 50,
  /** Panel continuing off to the right. */
  leave: 160,
} as const;

interface ImpactFrameProps {
  content: ImpactContent;
  /** Called once the frame has finished, so the caller can unmount it. */
  onDone: () => void;
}

/**
 * The moment a set goes down.
 *
 * Rendered as an absolutely-positioned child of the row it belongs to, so it
 * needs no measurement: every View in React Native positions its absolute
 * children against itself. It overhangs the row deliberately and takes no
 * touches, so a second tick during the 400ms lands on the row underneath as
 * normal.
 *
 * The panel and the figure share one `translateX` — the panel leans, the
 * figure stays upright, and both ride in and out together.
 */
export const ImpactFrame = ({ content, onDone }: ImpactFrameProps) => {
  const { width } = useWindowDimensions();
  // 0 is off to the left, 1 covering the row, 2 gone to the right.
  const sweep = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  /*
    Held in a ref, and left out of the animation's dependencies.

    The workout screen re-renders every second to advance its clock. With
    `onDone` in the dependency array, an inline callback at the call site would
    give this effect a new identity on each of those ticks and restart the
    animation from the left — the frame would never finish and never clear.
  */
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    // expo-haptics has nothing to drive on the web build, where this screen
    // also runs as the iOS PWA. Guarded rather than left to warn per set.
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    const run = Animated.sequence([
      Animated.parallel([
        Animated.timing(sweep, {
          toValue: 1,
          duration: TIMING.arrive,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(pop, {
          toValue: 1,
          duration: TIMING.pop,
          delay: TIMING.popDelay,
          easing: impact,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(TIMING.hold),
      Animated.timing(sweep, {
        toValue: 2,
        duration: TIMING.leave,
        easing: exit,
        useNativeDriver: true,
      }),
    ]);

    run.start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
    return () => run.stop();
  }, [sweep, pop]);

  const translateX = sweep.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [-width, 0, width],
  });

  return (
    <Animated.View style={styles.overlay} pointerEvents="none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: session.loud, transform: [{ translateX }, { skewX: SKEW }] },
        ]}
      />
      <Animated.View
        style={[
          styles.content,
          {
            transform: [
              { translateX },
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            ],
            opacity: pop,
          },
        ]}
      >
        <Text style={styles.figure}>{content.figure}</Text>
        <Text style={styles.verdict}>{content.verdict}</Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Overhangs the row on all four sides, so the diagonal cuts across the
  // layout instead of being contained by it.
  overlay: { position: 'absolute', top: -4, bottom: -4, left: -10, right: -10 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  figure: {
    fontFamily: font.figure,
    fontSize: 21,
    color: session.onLoud,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  verdict: {
    fontFamily: font.display,
    fontSize: 10,
    color: session.onLoud,
    letterSpacing: 2.4,
    marginTop: -1,
    opacity: 0.85,
  },
});
