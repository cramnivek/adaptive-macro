import React from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useEntrance } from '../theme/motion';

interface FadeInProps {
  children: React.ReactNode;
  /** Stagger within a list: the row index times a small step. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fades and lifts its children into place once, on mount.
 *
 * A component rather than a bare hook because the things that want this are
 * rendered inside a `.map`, where a hook cannot be called. Keys do the rest:
 * a row whose key is unchanged never re-animates, so logging one food slides
 * that food in and leaves the rest of the list alone, while changing the day
 * remounts every row and the new day arrives as a whole.
 */
export const FadeIn = ({ children, delay = 0, style }: FadeInProps) => {
  const entrance = useEntrance(delay);
  return <Animated.View style={[style, entrance]}>{children}</Animated.View>;
};
