import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { displayWeight } from '../format';
import { thud } from '../platform/haptics';
import type { UnitSystem, AppPersonality } from '../state/settings';
import { getEventCopy } from '../copy/personality';
import { SKEW, font, radius } from '../theme';

export interface PRCelebrationData {
  exerciseName: string;
  figure: string;
  e1rm: number;
  delta: number;
  isFirstLog: boolean;
}

interface PRCelebrationProps {
  data: PRCelebrationData;
  units: UnitSystem;
  personality?: AppPersonality;
  onDone: () => void;
}

const PARTICLE_COLORS = [
  '#FFD700', // Gold
  '#F59E0B', // Amber
  '#EF4444', // Crimson
  '#FF3B30', // Loud Red
  '#FFFFFF', // Electric Spark
  '#FEF08A', // Bright Flare
];

const NUM_PARTICLES = 30;

export const PRCelebration = ({ data, units, personality, onDone }: PRCelebrationProps) => {
  const { width, height } = useWindowDimensions();
  const animProgress = useRef(new Animated.Value(0)).current;
  const bannerScale = useRef(new Animated.Value(0.5)).current;
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerExit = useRef(new Animated.Value(1)).current;

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Seeded particles so each celebration has an energetic radial shockwave with angular shards:
  const particles = useMemo(() => {
    return Array.from({ length: NUM_PARTICLES }, (_, i) => {
      const angle = (i * (2 * Math.PI)) / NUM_PARTICLES + (Math.sin(i * 99) * 0.35);
      const speed = 120 + ((i * 37) % 240);
      const targetX = Math.cos(angle) * speed;
      // Slight upward lift against gravity
      const targetY = Math.sin(angle) * speed - 80;
      const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
      const shardWidth = 6 + (i % 8);
      const shardHeight = 12 + ((i * 3) % 16);
      const spin = (i % 2 === 0 ? 1 : -1) * (180 + ((i * 45) % 360));

      return {
        targetX,
        targetY,
        color,
        shardWidth,
        shardHeight,
        spin,
      };
    });
  }, []);

  useEffect(() => {
    // Double pulse for triumphant PR impact
    thud('heavy');
    const timer = setTimeout(() => {
      thud('heavy');
    }, 130);

    const animation = Animated.sequence([
      Animated.parallel([
        // Particle explosion outward
        Animated.timing(animProgress, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Banner spring entry
        Animated.parallel([
          Animated.spring(bannerScale, {
            toValue: 1,
            friction: 5,
            tension: 70,
            useNativeDriver: true,
          }),
          Animated.timing(bannerOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.delay(200),
      // Smooth exit
      Animated.parallel([
        Animated.timing(bannerExit, {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(bannerScale, {
          toValue: 1.08,
          duration: 280,
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        onDoneRef.current();
      }
    });

    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [animProgress, bannerScale, bannerOpacity, bannerExit]);

  const unitLabel = units === 'metric' ? 'KG' : 'LB';
  const e1rmFormatted = displayWeight(data.e1rm, units).toFixed(1);
  const deltaFormatted = displayWeight(data.delta, units).toFixed(1);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Particle Shards Burst (Centered around upper-middle screen) */}
      <View style={[styles.originCenter, { top: height * 0.38, left: width * 0.5 }]}>
        {particles.map((p, idx) => {
          const translateX = animProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, p.targetX],
          });
          // Parabolic trajectory: explodes outward, then curves downward with gravity
          const translateY = animProgress.interpolate({
            inputRange: [0, 0.45, 1],
            outputRange: [0, p.targetY * 0.7, p.targetY + 140],
          });
          const opacity = animProgress.interpolate({
            inputRange: [0, 0.75, 1],
            outputRange: [1, 0.9, 0],
          });
          const scale = animProgress.interpolate({
            inputRange: [0, 0.15, 1],
            outputRange: [0.3, 1.25, 0.2],
          });
          const rotate = animProgress.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', `${p.spin}deg`],
          });

          return (
            <Animated.View
              key={idx}
              style={[
                styles.particle,
                {
                  width: p.shardWidth,
                  height: p.shardHeight,
                  backgroundColor: p.color,
                  transform: [
                    { translateX },
                    { translateY },
                    { scale },
                    { rotate },
                    { skewX: SKEW },
                  ],
                  opacity,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Floating Heroic PR Trophy Banner */}
      <Animated.View
        style={[
          styles.bannerContainer,
          {
            top: height * 0.32,
            opacity: Animated.multiply(bannerOpacity, bannerExit),
            transform: [{ scale: bannerScale }],
          },
        ]}
      >
        <View style={styles.bannerCard}>
          {/* Angular Gold Background Slashes */}
          <View style={styles.bannerBackdrop} />

          {/* Top Flame Tag */}
          <View style={styles.tagWrap}>
            <Text style={styles.tagText}>
              {getEventCopy('workout.pr_banner_tag', { personality, seed: data.exerciseName })}
            </Text>
          </View>

          {/* Lift Details */}
          <Text style={styles.exerciseTitle} numberOfLines={1}>
            {data.exerciseName.toUpperCase()}
          </Text>

          {/* Big Figure */}
          <Text style={styles.figureText}>{data.figure}</Text>

          {/* 1RM Est Milestone */}
          <View style={styles.milestonePill}>
            <Text style={styles.milestoneText}>
              {data.isFirstLog
                ? getEventCopy('workout.pr_baseline_pill', {
                    personality,
                    facts: { e1rm: e1rmFormatted, unit: unitLabel },
                    seed: data.exerciseName,
                  })
                : getEventCopy('workout.pr_delta_pill', {
                    personality,
                    facts: { e1rm: e1rmFormatted, unit: unitLabel, delta: deltaFormatted },
                    seed: data.exerciseName,
                  })}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  originCenter: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9998,
  },
  particle: {
    position: 'absolute',
    borderRadius: 2,
    shadowColor: '#FFD700',
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  bannerContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  bannerCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(10, 10, 10, 0.94)',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  bannerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1C1917',
    borderRadius: radius.md,
    transform: [{ skewX: SKEW }],
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  tagWrap: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 3,
    marginBottom: 8,
    transform: [{ skewX: SKEW }],
  },
  tagText: {
    fontFamily: font.display,
    fontSize: 10,
    color: '#000000',
    fontWeight: '800',
    letterSpacing: 2,
  },
  exerciseTitle: {
    fontFamily: font.display,
    fontSize: 14,
    color: '#D4D4D8',
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  figureText: {
    fontFamily: font.figure,
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 4,
    fontVariant: ['tabular-nums'],
  },
  milestonePill: {
    marginTop: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  milestoneText: {
    fontFamily: font.figure,
    fontSize: 12,
    color: '#FEF08A',
    fontWeight: '700',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
});
