import type { Milestone } from '@adaptive-macros/engine';
import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { describeMilestone } from '../milestones';
import { thud } from '../platform/haptics';
import type { AppPersonality, UnitSystem } from '../state/settings';
import { getEventCopy } from '../copy/personality';
import { SKEW, font, space } from '../theme';
import { ease, impact } from '../theme/motion';
import { session as loud } from '../theme/sessionTheme';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';

interface MilestoneSheetProps {
  /** The one worth showing, or null for an ordinary workout. */
  milestone: Milestone | null;
  units: UnitSystem;
  onDismiss: () => void;
  personality?: AppPersonality;
}

/**
 * The moment something happened that is worth telling someone about.
 *
 * One per session and never more, shown when the workout is finished rather
 * than mid-set: it competes with nothing, it lands when you are done rather
 * than between efforts, and it keeps the impact frame as the thing that marks
 * a set. Medals that arrive constantly are forgettable precisely because they
 * arrive constantly.
 *
 * Built from the same parts as the impact frame, deliberately — a leaning red
 * field and a figure that punches in — so it reads as the same app shouting
 * louder, not as a different screen.
 */
export const MilestoneSheet = ({ milestone, units, onDismiss, personality }: MilestoneSheetProps) => {
  const enter = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (milestone === null) return;
    enter.setValue(0);
    pop.setValue(0);
    thud('heavy');

    const run = Animated.parallel([
      Animated.timing(enter, { toValue: 1, duration: 260, easing: ease, useNativeDriver: true }),
      Animated.timing(pop, {
        toValue: 1,
        duration: 320,
        delay: 120,
        easing: impact,
        useNativeDriver: true,
      }),
    ]);
    run.start();
    return () => run.stop();
  }, [milestone, enter, pop]);

  if (milestone === null) return null;
  const copy = describeMilestone(milestone, units, personality);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: enter,
              transform: [
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
              ],
            },
          ]}
        >
          {/* The band sits behind the figure and leans, like every other
              surface on this side of the app. */}
          <View style={[StyleSheet.absoluteFill, styles.band]} />

          <Text style={styles.label}>{copy.label}</Text>

          <Animated.View
            style={{
              transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
              opacity: pop,
            }}
          >
            <Text style={styles.figure} numberOfLines={1} adjustsFontSizeToFit>
              {copy.figure}
            </Text>
          </Animated.View>

          <Text style={styles.detail}>{copy.detail}</Text>
        </Animated.View>

        <Tappable onPress={onDismiss} scaleTo={0.97} style={styles.dismissWrap}>
          <SlashPanel color={loud.panel} style={styles.dismiss}>
            <Text style={styles.dismissLabel}>
              {getEventCopy('milestone.dismiss_btn', { personality, seed: milestone.value })}
            </Text>
          </SlashPanel>
        </Tappable>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,11,0.94)',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  band: { backgroundColor: loud.loud, transform: [{ skewX: SKEW }] },
  label: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 2.4,
    color: loud.onLoud,
    opacity: 0.85,
    textAlign: 'center',
  },
  figure: {
    fontFamily: font.figure,
    fontSize: 56,
    lineHeight: 62,
    letterSpacing: -2.5,
    color: loud.onLoud,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  detail: {
    fontFamily: font.ui,
    fontSize: 14,
    lineHeight: 20,
    color: loud.onLoud,
    textAlign: 'center',
    marginTop: space.xs,
    paddingHorizontal: space.md,
  },
  dismissWrap: { marginTop: space.xl },
  dismiss: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dismissLabel: { fontFamily: font.display, fontSize: 13, letterSpacing: 1.6, color: loud.figure },
});
