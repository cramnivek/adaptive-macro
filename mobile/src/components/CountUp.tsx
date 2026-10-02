import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useAnimatedTo } from '../theme/motion';

interface CountUpProps {
  value: number;
  style?: StyleProp<TextStyle>;
  /** Defaults to a rounded whole number. */
  format?: (value: number) => string;
}

/**
 * A figure that travels to its new value instead of jumping.
 *
 * React Native cannot interpolate an `Animated.Value` into text, so this
 * listens to one and holds the current frame in state. That costs a render per
 * frame for the duration, which is why it is used on the two or three headline
 * figures and not on every number in a column.
 *
 * It exists because animating the calorie ring alone looked broken: the arc
 * swept round over a fifth of a second while the number in the middle of it
 * had already changed.
 */
export const CountUp = ({ value, style, format }: CountUpProps) => {
  const animated = useAnimatedTo(value);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const id = animated.addListener((frame) => setShown(frame.value));
    return () => animated.removeListener(id);
  }, [animated]);

  return <Text style={style}>{format ? format(shown) : String(Math.round(shown))}</Text>;
};
