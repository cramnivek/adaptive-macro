import type { Nutrients } from '@adaptive-macros/engine';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { font, radius, space, useTheme } from '../theme';
import { useAnimatedTo } from '../theme/motion';
import { CountUp } from './CountUp';

interface ProgressBarProps {
  label: string;
  consumedG: number;
  targetG: number;
  color: string;
}

export const MacroBar = ({ label, consumedG, targetG, color }: ProgressBarProps) => {
  const { colors } = useTheme();
  const ratio = targetG > 0 ? consumedG / targetG : 0;
  const over = ratio > 1;
  // Clamped so an overshoot cannot render past the track; the number above it
  // still shows the true amount.
  const fill = useAnimatedTo(Math.min(Math.max(ratio, 0), 1));

  return (
    <View style={styles.barRow}>
      <View style={styles.barLabels}>
        <Text style={[styles.barLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.barValue, { color: over ? colors.danger : colors.textMuted }]}>
          {Math.round(consumedG)} / {Math.round(targetG)} g
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.surfaceRaised }]}>
        {/*
          Grows to its new length rather than appearing at it. Width is a
          layout property, so this one cannot run on the native driver — which
          is fine, because it fires when the day's totals change and not
          continuously.
        */}
        <Animated.View
          style={[
            styles.barFill,
            {
              width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: over ? colors.danger : color,
            },
          ]}
        />
      </View>
    </View>
  );
};

interface CalorieRingProps {
  consumedKcal: number;
  targetKcal: number;
  size?: number;
}

const AnimatedCircle =
  Platform.OS === 'web' ? (Circle as any) : Animated.createAnimatedComponent(Circle);

export const CalorieRing = ({ consumedKcal, targetKcal, size = 148 }: CalorieRingProps) => {
  const { colors } = useTheme();
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = targetKcal > 0 ? Math.min(Math.max(consumedKcal / targetKcal, 0), 1) : 0;
  const remaining = targetKcal - consumedKcal;
  const over = remaining < 0;
  const progress = useAnimatedTo(ratio);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.surfaceRaised}
          strokeWidth={stroke}
          fill="none"
        />
        {Platform.OS === 'web' ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={over ? colors.danger : colors.accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={over ? colors.danger : colors.accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            // The arc sweeps to the new figure. Paired with the CountUp below,
            // which travels over the same duration so the two agree.
            strokeDashoffset={progress.interpolate({
              inputRange: [0, 1],
              outputRange: [circumference, 0],
            })}
            // Rotate so the arc starts at 12 o'clock rather than 3 o'clock.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringCentre]}>
        <CountUp
          value={Math.abs(remaining)}
          style={[styles.ringValue, { color: over ? colors.danger : colors.text }]}
        />
        <Text style={[styles.ringLabel, { color: colors.textMuted }]}>
          {over ? 'kcal over' : 'kcal left'}
        </Text>
      </View>
    </View>
  );
};

interface MacroSummaryProps {
  consumed: Nutrients;
  target: Nutrients;
  compact?: boolean;
}

export const MacroSummary = ({ consumed, target, compact = false }: MacroSummaryProps) => {
  const { colors } = useTheme();
  if (compact) {
    const remaining = target.kcal - consumed.kcal;
    return (
      <View style={styles.compactSummary}>
        <View style={styles.calorieLine}>
          <Text style={[styles.calorieValue, { color: remaining < 0 ? colors.danger : colors.text }]}>
            {Math.round(Math.abs(remaining))}<Text style={[styles.calorieLabel, { color: colors.textMuted }]}> {remaining < 0 ? 'kcal over' : 'kcal left'}</Text>
          </Text>
          <Text style={[styles.calorieMeta, { color: colors.textMuted }]}>
            {Math.round(consumed.kcal)} / {Math.round(target.kcal)} kcal
          </Text>
        </View>
        <View style={styles.compactBars}>
          {([
            ['Protein', consumed.proteinG, target.proteinG, colors.protein],
            ['Carbs', consumed.carbsG, target.carbsG, colors.carbs],
            ['Fat', consumed.fatG, target.fatG, colors.fat],
          ] as const).map(([label, value, goal, color]) => (
            <View key={label} style={styles.compactMacro}>
              <Text style={[styles.barLabel, styles.compactLabel, { color: colors.text }]}>{label}</Text>
              <Text style={[styles.compactValue, { color: value > goal ? colors.danger : colors.textMuted }]}>
                {Math.round(value)} / {Math.round(goal)} g
              </Text>
              <View style={[styles.barTrack, styles.compactTrack, { backgroundColor: colors.surfaceRaised }]}>
                <View style={[styles.barFill, { width: `${goal > 0 ? Math.min(100, Math.max(0, value / goal * 100)) : 0}%`, backgroundColor: value > goal ? colors.danger : color }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.summary}>
      <CalorieRing consumedKcal={consumed.kcal} targetKcal={target.kcal} />
      <View style={styles.bars}>
        <MacroBar label="Protein" consumedG={consumed.proteinG} targetG={target.proteinG} color={colors.protein} />
        <MacroBar label="Carbs" consumedG={consumed.carbsG} targetG={target.carbsG} color={colors.carbs} />
        <MacroBar label="Fat" consumedG={consumed.fatG} targetG={target.fatG} color={colors.fat} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  compactSummary: { gap: space.sm },
  calorieLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: space.sm, rowGap: space.xs },
  calorieValue: { fontFamily: font.figure, fontSize: 28, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  calorieLabel: { fontFamily: font.ui, fontSize: 13, letterSpacing: 0 },
  calorieMeta: { fontFamily: font.ui, fontSize: 11 },
  compactBars: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  compactMacro: { flex: 1, minWidth: 68, gap: 2 },
  compactLabel: { lineHeight: 18, includeFontPadding: false },
  compactValue: { fontFamily: font.figure, fontSize: 12, lineHeight: 16, includeFontPadding: false, fontVariant: ['tabular-nums'] },
  compactTrack: { height: 6 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.lg },
  bars: { flex: 1, minWidth: 140, gap: space.md },
  barRow: { gap: space.xs },
  barLabels: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: space.sm, rowGap: space.xs },
  barLabel: { fontFamily: font.uiStrong, fontSize: 13 },
  barValue: { fontFamily: font.figure, fontSize: 12, fontVariant: ['tabular-nums'] },
  barTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  ringCentre: { alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontFamily: font.figure, fontSize: 30, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  ringLabel: { fontFamily: font.ui, fontSize: 11, marginTop: -2 },
});
