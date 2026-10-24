import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { createMotionPreference } from './motionPreference';

/**
 * Shared motion vocabulary.
 *
 * Until now nothing in this app moved: `grep Animated` across `src` and `app`
 * returned nothing at all. The result read as stiff rather than minimal — a
 * tapped control changed opacity and that was the whole of the feedback.
 *
 * These are tokens in the same sense as `space` and `radius`: screens pick a
 * duration and an easing from here rather than inventing numbers, so a press
 * in Settings feels like a press in the workout logger. Every value is on the
 * short side deliberately. Motion that you notice as motion is motion you will
 * resent by the fiftieth time, and this is an app used mid-set.
 */
export const duration = {
  /** Press feedback. Short enough to read as a response, not an animation. */
  press: 90,
  /** Entrances, bars filling, the toast arriving. */
  enter: 220,
  /** A panel crossing a row. */
  sweep: 300,
  /** Charts settle as quickly as the surrounding interface. */
  draw: 220,
} as const;

/** Decelerates into place. For anything arriving or settling. */
export const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** Accelerates away. For anything leaving, so an exit does not drag. */
export const exit = Easing.bezier(0.5, 0, 0.75, 0);

/**
 * Overshoots roughly 8% and settles back.
 *
 * For a figure that should land with some weight behind it. Do not use this on
 * anything that changes size often — the overshoot reads as a wobble when it
 * repeats.
 */
export const impact = Easing.bezier(0.34, 1.56, 0.64, 1);

/**
 * Fades and lifts a thing into place on mount.
 *
 * `delay` staggers a list: pass the row index times a small step. Keep the
 * total under about 200ms, because a long stagger means the last row of a
 * screenful arrives visibly after the first and the whole screen feels slow
 * to load rather than lively.
 */
export const useEntrance = (delay = 0) => {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.stopAnimation();
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: duration.enter,
      delay,
      easing: ease,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay, reduceMotion]);

  return {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 10, 0] }) }],
  };
};

/**
 * A single platform subscription serves every animated component. Until the
 * first read finishes, show content immediately rather than risk moving it
 * for someone who has explicitly asked for less motion.
 */
const motionPreference = createMotionPreference(
  () => AccessibilityInfo.isReduceMotionEnabled(),
  (changed) => {
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', changed);
    return () => subscription.remove();
  },
);
export const useReduceMotion = (): boolean =>
  useSyncExternalStore(motionPreference.subscribe, motionPreference.getSnapshot, () => true);

/**
 * Drives a value towards a target whenever it changes, rather than snapping.
 *
 * Used for the macro bars and the calorie ring, which both animate a layout or
 * paint property and so cannot run on the native driver. That is acceptable
 * here: they are one-shot animations that fire when the day's totals change,
 * not continuous ones.
 */
export const useAnimatedTo = (target: number): Animated.Value => {
  const value = useRef(new Animated.Value(target)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      value.stopAnimation();
      value.setValue(target);
      return;
    }
    const animation = Animated.timing(value, {
      toValue: target,
      duration: duration.enter,
      easing: ease,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [value, target, reduceMotion]);

  return value;
};
