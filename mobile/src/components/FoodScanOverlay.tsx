import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scanPhaseOf } from '../ai/foodScan';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';

interface FoodScanOverlayProps {
  /** How long the estimation has been running in seconds. */
  elapsed?: number;
  /** Accent colour for the beam and reticle. Defaults to Ascend's signature red. */
  color?: string;
  /** Whether this sits on a thumbnail preview rather than full screen. */
  compact?: boolean;
}

const BEAM_H = 64;
const COMPACT_BEAM_H = 24;

/**
 * An oscillating machine-vision scan sweep and reticle overlay.
 *
 * Drawn over a captured plate while the model estimates it: a frozen still
 * with a plain spinner reads as a hang, especially on local models taking ten
 * to thirty seconds. The sweep and corner brackets communicate that the engine
 * is actively analyzing pixels, and the HUD reflects the true stage of the
 * pipeline (scanning -> identifying -> portioning -> inferring).
 *
 * Transforms and opacities run on the native driver for a locked 60fps loop on
 * mobile and web, with zero layout recalculation.
 */
export const FoodScanOverlay = ({
  elapsed = 0,
  color = loud.loud,
  compact = false,
}: FoodScanOverlayProps) => {
  const gradientId = useId();
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);

  // The laser sweep: oscillates smoothly top-to-bottom and back.
  const sweep = useRef(new Animated.Value(0)).current;
  // The reticle brackets: a subtle slow breathing pulse.
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const sweepLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    sweepLoop.start();
    pulseLoop.start();

    return () => {
      sweepLoop.stop();
      pulseLoop.stop();
    };
  }, [sweep, pulse]);

  const beamHeight = compact ? COMPACT_BEAM_H : BEAM_H;
  const maxTravel = layout ? Math.max(0, layout.height - beamHeight) : 300;

  const translateY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [0, maxTravel],
  });

  const phase = scanPhaseOf(elapsed);
  const cornerSize = compact ? 12 : 28;
  const cornerBorder = compact ? 1.5 : 2;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLayout({ width, height });
      }}
    >
      {/* 1. Viewfinder corner brackets framing the food. */}
      <Animated.View style={[styles.bracketsContainer, { opacity: pulse }]}>
        {/* Top Left */}
        <View
          style={[
            styles.corner,
            {
              top: compact ? 4 : space.xl,
              left: compact ? 4 : space.lg,
              width: cornerSize,
              height: cornerSize,
              borderTopWidth: cornerBorder,
              borderLeftWidth: cornerBorder,
              borderColor: color,
            },
          ]}
        />
        {/* Top Right */}
        <View
          style={[
            styles.corner,
            {
              top: compact ? 4 : space.xl,
              right: compact ? 4 : space.lg,
              width: cornerSize,
              height: cornerSize,
              borderTopWidth: cornerBorder,
              borderRightWidth: cornerBorder,
              borderColor: color,
            },
          ]}
        />
        {/* Bottom Left */}
        <View
          style={[
            styles.corner,
            {
              bottom: compact ? 4 : space.xl,
              left: compact ? 4 : space.lg,
              width: cornerSize,
              height: cornerSize,
              borderBottomWidth: cornerBorder,
              borderLeftWidth: cornerBorder,
              borderColor: color,
            },
          ]}
        />
        {/* Bottom Right */}
        <View
          style={[
            styles.corner,
            {
              bottom: compact ? 4 : space.xl,
              right: compact ? 4 : space.lg,
              width: cornerSize,
              height: cornerSize,
              borderBottomWidth: cornerBorder,
              borderRightWidth: cornerBorder,
              borderColor: color,
            },
          ]}
        />
      </Animated.View>

      {/* 2. Full-screen subtle center crosshairs on larger viewfinder */}
      {!compact && (
        <Animated.View style={[styles.crosshairContainer, { opacity: pulse }]}>
          <View style={[styles.crosshairH, { backgroundColor: color }]} />
          <View style={[styles.crosshairV, { backgroundColor: color }]} />
        </Animated.View>
      )}

      {/* 3. The moving laser sweep beam. */}
      {layout !== null && (
        <Animated.View
          style={[
            styles.beamContainer,
            {
              width: layout.width,
              height: beamHeight,
              transform: [{ translateY }],
            },
          ]}
        >
          <Svg width="100%" height={beamHeight}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0" />
                <Stop offset="0.7" stopColor={color} stopOpacity={compact ? 0.2 : 0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={compact ? 0.75 : 0.9} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height={beamHeight} fill={`url(#${gradientId})`} />
            <Line
              x1="0"
              y1={beamHeight - 1}
              x2="100%"
              y2={beamHeight - 1}
              stroke={color}
              strokeWidth={compact ? 1.5 : 2}
            />
          </Svg>
        </Animated.View>
      )}

      {/* 4. Technical HUD status pill on full-screen view. */}
      {!compact && (
        <View style={styles.hudBadgeWrapper}>
          <Animated.View style={[styles.hudBadge, { borderColor: color, opacity: pulse }]}>
            <View style={[styles.hudDot, { backgroundColor: color }]} />
            <Text style={[styles.hudText, { color: loud.figure }]}>
              {phase.code} · {elapsed}S
            </Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bracketsContainer: {
    ...StyleSheet.absoluteFill,
  },
  corner: {
    position: 'absolute',
  },
  crosshairContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    width: 20,
    height: 1,
    opacity: 0.35,
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: 20,
    opacity: 0.35,
  },
  beamContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  hudBadgeWrapper: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10, 10, 11, 0.75)',
    borderWidth: 1,
  },
  hudDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  hudText: {
    fontFamily: font.figure,
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
