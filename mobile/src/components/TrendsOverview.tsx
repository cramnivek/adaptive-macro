import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, useTheme } from '../theme';
import { formatDayMonth } from '../format';
import type { PeriodMapBucket } from '../trendsOverview';
import { Tappable } from './Tappable';
import { TOUCH_TARGET } from './Controls';

interface Props {
  buckets: PeriodMapBucket[];
  title: string;
  note: string;
  facts: { label: string; value: string; note: string }[];
  onFocus: (tab: 'food' | 'body' | 'workouts') => void;
}

/** Aligned records make gaps visible without turning logging into a health grade. */
export const TrendsOverview = ({ buckets, title, note, facts, onFocus }: Props) => {
  const { colors } = useTheme();
  const grouped = buckets.some((bucket) => bucket.days > 1);
  return (
    <View>
      <Text style={[styles.eyebrow, { color: colors.brand.text }]}>THE BIG PICTURE</Text>
      <Text style={[styles.headline, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>
      <View style={[styles.map, { backgroundColor: colors.surface }]}>
        <View style={styles.mapHeading}>
          <Text style={[styles.mapTitle, { color: colors.text }]}>{grouped ? 'Your recorded days' : 'Your week at a glance'}</Text>
          <Text style={[styles.caption, { color: colors.textMuted }]}>Tap a row to explore</Text>
        </View>
        <View style={styles.columnHeading} accessible={false}>
          <View style={styles.rowLabel} />
          {buckets.map((bucket) => (
            <Text key={bucket.from} style={[styles.columnLabel, { color: colors.textMuted }]}>
              {grouped ? formatDayMonth(bucket.from).replace(' ', '\n') : ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${bucket.from}T12:00:00`).getDay()]}
            </Text>
          ))}
          <View style={styles.arrow} />
        </View>
        {([
          { key: 'food', label: 'Food', tab: 'food' },
          { key: 'weight', label: 'Weight', tab: 'body' },
          { key: 'training', label: 'Training', tab: 'workouts' },
        ] as const).map((row) => (
          <Tappable key={row.key} onPress={() => onFocus(row.tab)} style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}, explore details. ${buckets.map((bucket) => `${formatDayMonth(bucket.from)}${bucket.days > 1 ? ` to ${formatDayMonth(bucket.to)}` : ''}: ${bucket[row.key]} recorded day${bucket[row.key] === 1 ? '' : 's'}${row.key === 'food' && bucket.leftOutFood ? `, ${bucket.leftOutFood} left out of estimates` : ''}`).join('. ')}`}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>{row.label}</Text>
            {buckets.map((bucket) => {
              const value = bucket[row.key];
              const leftOut = row.key === 'food' && bucket.leftOutFood > 0;
              return (
                <View key={bucket.from} style={styles.cell}>
                  <View style={[styles.mark, {
                    backgroundColor: value ? colors.brand.fill : colors.surfaceRaised,
                    borderColor: leftOut ? colors.textMuted : 'transparent',
                    borderWidth: leftOut ? 1 : 0,
                  }]}>
                    <Text style={[styles.markText, { color: value ? colors.brand.onFill : colors.textMuted }]}>
                      {grouped && value ? String(value) : value ? '•' : leftOut ? '○' : '—'}
                    </Text>
                  </View>
                </View>
              );
            })}
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={styles.arrow} />
          </Tappable>
        ))}
        <Text style={[styles.caption, { color: colors.textMuted }]}>
          {grouped ? 'Days recorded from each date to the next column. ' : ''}— No record · ○ Food left out of estimates
        </Text>
      </View>
      <View style={styles.facts}>
        {facts.map((fact) => (
          <View key={fact.label} style={[styles.fact, { borderTopColor: colors.border }]}>
            <Text style={[styles.factLabel, { color: colors.textMuted }]}>{fact.label}</Text>
            <Text style={[styles.factValue, { color: colors.text }]}>{fact.value}</Text>
            <Text style={[styles.caption, { color: colors.textMuted }]}>{fact.note}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  eyebrow: { fontFamily: font.uiStrong, fontSize: 11, letterSpacing: 1.6, marginTop: space.sm },
  headline: { fontFamily: font.display, fontSize: 34, letterSpacing: -1.3, marginTop: space.xs },
  note: { fontFamily: font.ui, fontSize: 13, lineHeight: 19, marginTop: space.xs, marginBottom: space.md },
  map: { borderRadius: radius.lg, padding: space.md, marginBottom: space.md },
  mapHeading: { gap: space.xs, marginBottom: space.xs },
  mapTitle: { fontFamily: font.uiStrong, fontSize: 14 },
  row: { flexDirection: 'row', minHeight: TOUCH_TARGET, alignItems: 'center' },
  columnHeading: { flexDirection: 'row', minHeight: 28, alignItems: 'center' },
  rowLabel: { width: 66, fontFamily: font.uiStrong, fontSize: 12 },
  columnLabel: { flex: 1, minWidth: 0, textAlign: 'center', fontFamily: font.ui, fontSize: 10 },
  cell: { flex: 1, minWidth: 0, alignItems: 'center' },
  mark: { width: '88%', maxWidth: 32, minHeight: 28, borderRadius: radius.sm, justifyContent: 'center' },
  markText: { textAlign: 'center', fontFamily: font.uiStrong, fontSize: 13 },
  arrow: { width: 16 },
  caption: { fontFamily: font.ui, fontSize: 10, lineHeight: 15 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  fact: { flex: 1, minWidth: 86, borderTopWidth: 1, paddingTop: space.sm },
  factLabel: { fontFamily: font.uiStrong, fontSize: 10, marginBottom: space.xs },
  factValue: { fontFamily: font.display, fontSize: 22, letterSpacing: -0.6, marginBottom: space.xs },
});
