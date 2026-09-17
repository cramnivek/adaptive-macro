import type { Nutrients } from '@adaptive-macros/engine';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { radius, space, useTheme } from '../theme';

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

  return (
    <View style={styles.barRow}>
      <View style={styles.barLabels}>
        <Text style={[styles.barLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.barValue, { color: over ? colors.danger : colors.textMuted }]}>
          {Math.round(consumedG)} / {Math.round(targetG)} g
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.surfaceRaised }]}>
        <View
          style={[
            styles.barFill,
            {
              // Clamped so an overshoot cannot render past the track; the
              // number above it still shows the true amount.
              width: `${Math.min(Math.max(ratio, 0), 1) * 100}%`,
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

export const CalorieRing = ({ consumedKcal, targetKcal, size = 148 }: CalorieRingProps) => {
  const { colors } = useTheme();
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = targetKcal > 0 ? Math.min(Math.max(consumedKcal / targetKcal, 0), 1) : 0;
  const remaining = targetKcal - consumedKcal;
  const over = remaining < 0;

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
          // Rotate so the arc starts at 12 o'clock rather than 3 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringCentre]}>
        <Text style={[styles.ringValue, { color: over ? colors.danger : colors.text }]}>
          {Math.abs(Math.round(remaining))}
        </Text>
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
}

export const MacroSummary = ({ consumed, target }: MacroSummaryProps) => {
  const { colors } = useTheme();
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
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  bars: { flex: 1, gap: space.md },
  barRow: { gap: space.xs },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 13, fontWeight: '600' },
  barValue: { fontSize: 12, fontVariant: ['tabular-nums'] },
  barTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  ringCentre: { alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 30, fontWeight: '700', letterSpacing: -1 },
  ringLabel: { fontSize: 11, marginTop: -2 },
});
