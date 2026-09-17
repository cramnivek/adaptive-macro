import type { Food } from '@adaptive-macros/engine';
import { isNutritionallyConsistent } from '@adaptive-macros/engine';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, space, useTheme } from '../theme';
import { Button } from './Controls';

interface LookupCandidateSheetProps {
  food: Food | null;
  onCancel: () => void;
  onSave: (food: Food) => void;
}

/**
 * Shows what a grounded lookup found, and where it came from, before anything
 * is written.
 *
 * The domains are listed plainly with no authority badge. The user is the one
 * who can tell an operator's own figures from an SEO lookalike that copied
 * them, and a badge claiming otherwise would launder a guess as a source.
 */
export const LookupCandidateSheet = ({ food, onCancel, onSave }: LookupCandidateSheetProps) => {
  const { colors } = useTheme();
  if (!food) return null;

  const portion = food.portions[food.portions.length - 1] ?? food.portions[0];
  const suspect = !isNutritionallyConsistent(food.per100g);
  const domains = food.sources ?? [];

  return (
    <Modal visible={food !== null} animationType="slide" transparent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={[styles.name, { color: colors.text }]}>{food.name}</Text>
          {food.brand && <Text style={[styles.brand, { color: colors.textMuted }]}>{food.brand}</Text>}

          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {portion.label} ({Math.round(portion.grams)} g) ·{' '}
            {Math.round((food.per100g.kcal * portion.grams) / 100)} kcal
          </Text>
          <Text style={[styles.meta, { color: colors.textFaint }]}>
            Per 100 g: {Math.round(food.per100g.kcal)} kcal · P {Math.round(food.per100g.proteinG)} · C{' '}
            {Math.round(food.per100g.carbsG)} · F {Math.round(food.per100g.fatG)}
          </Text>

          {suspect && (
            <View style={[styles.warning, { borderColor: colors.warning, backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.warningText, { color: colors.textMuted }]}>
                Its macros do not add up to its calories — one of the two is wrong.
              </Text>
            </View>
          )}

          <Text style={[styles.sourcesLabel, { color: colors.textFaint }]}>Read from</Text>
          {domains.map((domain) => (
            <Text key={domain} style={[styles.source, { color: colors.textFaint }]}>
              {domain}
            </Text>
          ))}

          <Text style={[styles.disclaimer, { color: colors.textFaint }]}>
            Estimated from web sources, not a verified label. Check it against the packaging or
            receipt when you can.
          </Text>

          <Button label="Save this food" onPress={() => onSave(food)} />
          <View style={{ height: space.sm }} />
          <Button label="Discard" variant="subtle" onPress={onCancel} />
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  name: { fontSize: 18, fontWeight: '700' },
  brand: { fontSize: 13, marginTop: 2 },
  meta: { fontSize: 13, marginTop: space.xs },
  warning: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  warningText: { fontSize: 12, lineHeight: 17 },
  sourcesLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: space.lg,
  },
  source: { fontSize: 12, marginTop: 2 },
  disclaimer: { fontSize: 12, marginTop: space.lg, marginBottom: space.md, lineHeight: 17 },
});
