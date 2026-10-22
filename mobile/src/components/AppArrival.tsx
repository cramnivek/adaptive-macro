import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { ease, useReduceMotion } from '../theme/motion';
import { releaseSplash } from '../platform/splash';

/**
 * The app opening: everything fades up from the background colour and
 * settles from just under full size, once, when the fonts are in.
 *
 * Until now it cut from an empty page in the background colour straight to a
 * finished screen, which reads as a page loading rather than an app opening.
 * The background is painted underneath so the fade is from the app's own
 * colour, never from white. With reduce motion on it is the fade alone.
 */
export const AppArrival = ({ background, children }: { background: string; children: React.ReactNode }) => {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // The launch screen was held for this moment; the fade takes over from it.
    releaseSplash();
    const animation = Animated.timing(progress, { toValue: 1, duration: 420, easing: ease, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View style={[styles.fill, { backgroundColor: background }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            opacity: progress,
            transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 1 : 0.97, 1] }) }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({ fill: { flex: 1 } });
