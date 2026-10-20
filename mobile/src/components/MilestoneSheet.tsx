import type { Milestone } from '@adaptive-macros/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { displayWeight } from '../format';
import { describeMilestone } from '../milestones';
import { playEffect } from '../platform/chime';
import { thud } from '../platform/haptics';
import type { AppPersonality, UnitSystem } from '../state/settings';
import { useApp } from '../state/AppStore';
import { getEventCopy } from '../copy/personality';
import { SKEW, font, radius, space } from '../theme';
import { ease, impact, useReduceMotion } from '../theme/motion';
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

/** Shards in the burst: enough to read as a burst, few enough to stay cheap. */
const SHARDS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12);
  const distance = 120 + (i % 3) * 30;
  return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance * 0.7, spin: (i % 2 ? 1 : -1) * (90 + i * 15) };
});

/**
 * The moment something happened that is worth telling someone about.
 *
 * One per session and never more, shown when the workout is finished rather
 * than mid-set: it competes with nothing, it lands when you are done rather
 * than between efforts, and it keeps the impact frame as the thing that marks
 * a set. Medals that arrive constantly are forgettable precisely because they
 * arrive constantly.
 *
 * Built from the same parts as the impact frame — a leaning red field and a
 * figure that punches in — so it reads as the same app shouting louder. On top
 * of that it now says what happened beside the round number (today's best and
 * the one it beat), counts up to the figure, bursts once, and plays the PR
 * sting with the heavy haptic. With reduce motion on it is a plain fade.
 */
export const MilestoneSheet = ({ milestone, units, onDismiss, personality }: MilestoneSheetProps) => {
  const { settings } = useApp();
  const reduceMotion = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const count = useRef(new Animated.Value(0)).current;
  const [counted, setCounted] = useState(1);

  useEffect(() => {
    const id = count.addListener(({ value }) => setCounted(value));
    return () => count.removeListener(id);
  }, [count]);

  useEffect(() => {
    if (milestone === null) return;
    thud('heavy');
    if (settings.effectSounds) playEffect('pr');

    if (reduceMotion) {
      enter.setValue(0);
      pop.setValue(1);
      count.setValue(1);
      burst.setValue(0);
      const fade = Animated.timing(enter, { toValue: 1, duration: 200, easing: ease, useNativeDriver: true });
      fade.start();
      return () => fade.stop();
    }

    enter.setValue(0);
    pop.setValue(0);
    burst.setValue(0);
    count.setValue(0);
    const run = Animated.parallel([
      Animated.timing(enter, { toValue: 1, duration: 380, easing: impact, useNativeDriver: true }),
      Animated.timing(pop, { toValue: 1, duration: 320, delay: 140, easing: impact, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 750, delay: 160, easing: ease, useNativeDriver: true }),
      // Not on the native driver: it drives text, through the listener above.
      Animated.timing(count, { toValue: 1, duration: 700, delay: 140, easing: ease, useNativeDriver: false }),
    ]);
    run.start();
    return () => run.stop();
  }, [milestone, reduceMotion, settings.effectSounds, enter, pop, burst, count]);

  const copy = useMemo(
    () => (milestone === null ? null : describeMilestone(milestone, units, personality)),
    [milestone, units, personality],
  );

  if (milestone === null || copy === null) return null;

  // The figure counts from the previous best (or 60% of the landmark when there
  // is none) to the landmark, then reads exactly as describeMilestone says.
  const from = milestone.previous && milestone.previous > 0 ? milestone.previous : milestone.value * 0.6;
  const unit = units === 'metric' ? 'kg' : 'lb';
  const between = from + (milestone.value - from) * counted;
  const figure =
    counted >= 1
      ? copy.figure
      : milestone.kind === 'sessions'
        ? String(Math.round(between))
        : `${Math.round(displayWeight(between, units)).toLocaleString('en-US')} ${unit}`;

  const kicker = milestone.kind === 'load' ? 'NEW PERSONAL RECORD' : 'NEW MILESTONE';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Animated.Text style={[styles.kicker, { opacity: enter }]}>{kicker}</Animated.Text>

        <View style={styles.stage}>
          {!reduceMotion &&
            SHARDS.map((shard, i) => (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={[
                  styles.shard,
                  i % 3 === 0 ? styles.shardLight : null,
                  {
                    opacity: burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                    transform: [
                      { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, shard.dx] }) },
                      { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, shard.dy] }) },
                      {
                        rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${shard.spin}deg`] }),
                      },
                    ],
                  },
                ]}
              />
            ))}

          <Animated.View
            style={[
              styles.card,
              {
                opacity: enter,
                transform: [
                  { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
                  { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
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
                {figure}
              </Text>
            </Animated.View>

            <Text style={styles.detail}>{copy.detail}</Text>
          </Animated.View>
        </View>

        {copy.context && (
          <Animated.View style={[styles.context, { opacity: pop }]}>
            <Text style={styles.contextText}>{copy.context}</Text>
          </Animated.View>
        )}

        <Tappable onPress={onDismiss} scaleTo={0.97} style={styles.dismissWrap}>
          <SlashPanel color={loud.panel} style={styles.dismiss}>
            <Text style={styles.dismissLabel}>
              {getEventCopy('milestone.dismiss_btn', { personality, seed: milestone.value })}
            </Text>
          </SlashPanel>
        </Tappable>
        <Text style={styles.next}>Your share card is next</Text>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,11,0.985)',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: space.xl,
  },
  kicker: {
    fontFamily: font.display,
    fontSize: 13,
    letterSpacing: 3,
    color: loud.figure,
    textAlign: 'center',
    marginBottom: space.lg,
  },
  stage: { alignItems: 'stretch', justifyContent: 'center' },
  shard: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 14,
    height: 5,
    marginLeft: -7,
    marginTop: -2.5,
    borderRadius: 1,
    backgroundColor: loud.loud,
  },
  shardLight: { backgroundColor: loud.onLoud },
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
  context: {
    alignSelf: 'center',
    marginTop: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: loud.panel,
    borderWidth: 1,
    borderColor: loud.rule,
  },
  contextText: { fontFamily: font.figure, fontSize: 13, color: loud.figure, fontVariant: ['tabular-nums'] },
  dismissWrap: { marginTop: space.xl },
  dismiss: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  dismissLabel: { fontFamily: font.display, fontSize: 14, letterSpacing: 1.6, color: loud.figure },
  next: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureMuted,
    textAlign: 'center',
    marginTop: space.sm,
  },
});
