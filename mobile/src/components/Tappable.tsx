import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { duration, ease } from '../theme/motion';

/**
 * The transform goes on the Pressable itself rather than on a wrapper, so a
 * caller's layout props — `flex`, `width`, `minHeight` — keep behaving exactly
 * as they did before. Wrapping instead would have made every call site's
 * sizing a guess.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TappableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /**
   * How far it sinks under a finger. Small slabs need more than large ones to
   * read as the same gesture, because the eye judges it as a proportion.
   */
  scaleTo?: number;
}

/**
 * A Pressable that sinks when you touch it.
 *
 * Every control in this app signalled a press by dropping its opacity, which
 * is the cheapest possible feedback and reads as a flicker rather than a
 * response. A short scale instead makes a tap feel like it connected with
 * something, and costs one transform on the native driver.
 */
export const Tappable = ({ style, children, scaleTo = 0.97, onPressIn, onPressOut, ...rest }: TappableProps) => {
  const scale = useRef(new Animated.Value(1)).current;

  const springTo = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: duration.press,
      easing: ease,
      useNativeDriver: true,
    }).start();

  return (
    <AnimatedPressable
      onPressIn={(event: GestureResponderEvent) => {
        springTo(scaleTo);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        springTo(1);
        onPressOut?.(event);
      }}
      style={[style, { transform: [{ scale }] }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
};
