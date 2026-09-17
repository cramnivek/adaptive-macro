import { StyleSheet, Text, View } from 'react-native';
import { radius, space, useTheme } from '../theme';

interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}

export const StatTile = ({ label, value, unit, hint, tone = 'default' }: StatTileProps) => {
  const { colors } = useTheme();
  const valueColor =
    tone === 'positive'
      ? colors.positive
      : tone === 'warning'
        ? colors.warning
        : tone === 'danger'
          ? colors.danger
          : colors.text;

  return (
    <View style={[styles.tile, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
        {unit && <Text style={[styles.unit, { color: colors.textFaint }]}>{unit}</Text>}
      </View>
      {hint && <Text style={[styles.hint, { color: colors.textFaint }]}>{hint}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 96,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: space.xs },
  value: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  unit: { fontSize: 12, marginLeft: 3 },
  hint: { fontSize: 11, marginTop: 2 },
});
