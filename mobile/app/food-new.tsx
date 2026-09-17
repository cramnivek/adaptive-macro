import type { Food, FoodPortion, Nutrients } from '@adaptive-macros/engine';
import { kcalFromMacros, roundTo } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field, Segmented } from '../src/components/Controls';
import { saveFood } from '../src/db';
import { radius, space, useTheme } from '../src/theme';

/**
 * Create a food by hand.
 *
 * Needed because the two food databases between them still miss plenty:
 * anything homemade, anything local, anything sold loose. Without this, a food
 * they do not carry simply cannot be logged.
 */

type Basis = 'per100g' | 'perServing';

/** Parses a typed number, treating blank as zero but rubbish as invalid. */
const parseAmount = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  const value = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export default function NewFoodScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string }>();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [basis, setBasis] = useState<Basis>('per100g');
  const [servingLabel, setServingLabel] = useState('');
  const [servingG, setServingG] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amounts = {
    kcal: parseAmount(kcal),
    proteinG: parseAmount(protein),
    carbsG: parseAmount(carbs),
    fatG: parseAmount(fat),
    fiberG: parseAmount(fiber),
  };

  // Calories implied by the macros as typed, for the cross-check below.
  const impliedKcal = useMemo(() => {
    const { proteinG, carbsG, fatG } = amounts;
    if (proteinG === null || carbsG === null || fatG === null) return null;
    return roundTo(kcalFromMacros({ kcal: 0, proteinG, carbsG, fatG }));
  }, [amounts.proteinG, amounts.carbsG, amounts.fatG]);

  // Flagged, never silently corrected: the label might be right and a macro
  // mistyped, or the reverse, and guessing which would invent a number.
  const kcalDisagrees =
    impliedKcal !== null &&
    amounts.kcal !== null &&
    amounts.kcal > 0 &&
    impliedKcal > 0 &&
    Math.abs(impliedKcal - amounts.kcal) / amounts.kcal > 0.15;

  const save = async () => {
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give the food a name.');
      return;
    }

    const entries = Object.entries(amounts);
    const invalid = entries.find(([, value]) => value === null);
    if (invalid) {
      setError('Calories and macros must be numbers, or left blank for zero.');
      return;
    }

    const typed = amounts as { [K in keyof typeof amounts]: number };

    // A per-serving entry is scaled onto the per-100 g basis everything else
    // uses, so portion maths stays a single multiply throughout the app.
    let divisor = 100;
    const portions: FoodPortion[] = [{ label: '100 g', grams: 100 }];

    if (basis === 'perServing') {
      const grams = parseAmount(servingG);
      if (grams === null || grams <= 0) {
        setError('Enter how many grams one serving weighs.');
        return;
      }
      divisor = grams;
      portions.push({ label: servingLabel.trim() || `1 serving (${grams} g)`, grams });
    }

    const scale = 100 / divisor;
    const per100g: Nutrients = {
      kcal: typed.kcal * scale,
      proteinG: typed.proteinG * scale,
      carbsG: typed.carbsG * scale,
      fatG: typed.fatG * scale,
      fiberG: typed.fiberG * scale,
    };

    if (per100g.kcal <= 0 && kcalFromMacros(per100g) <= 0) {
      setError('Enter at least calories or some macros.');
      return;
    }

    const food: Food = {
      id: `custom:${Date.now()}`,
      name: trimmedName,
      brand: brand.trim() || undefined,
      source: 'custom',
      // Calories left blank fall back to what the macros imply, which is a
      // derivation from what was entered rather than an invention.
      per100g: per100g.kcal > 0 ? per100g : { ...per100g, kcal: kcalFromMacros(per100g) },
      portions,
      fetchedAt: new Date().toISOString(),
    };

    await saveFood(food);

    // Hands the new food straight back to search, which opens the portion
    // sheet for it — creating a food is almost always a prelude to logging it.
    router.replace({
      pathname: '/search',
      params: { meal: params.meal ?? 'snack', justCreated: food.id },
    });
  };

  const perLabel = basis === 'per100g' ? 'per 100 g' : 'per serving';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card title="What is it?">
        <Field label="Name" value={name} onChangeText={setName} placeholder="Mum's lasagne" />
        <Field
          label="Brand (optional)"
          value={brand}
          onChangeText={setBrand}
          placeholder="Homemade"
        />
      </Card>

      <Card
        title="Nutrition"
        subtitle="Copy the label exactly — whichever column it gives you."
      >
        <Segmented<Basis>
          label="Figures are"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'per100g', label: 'Per 100 g' },
            { value: 'perServing', label: 'Per serving' },
          ]}
        />

        {basis === 'perServing' && (
          <>
            <Field
              label="One serving weighs"
              value={servingG}
              onChangeText={setServingG}
              keyboardType="decimal-pad"
              suffix="g"
              hint="Needed to convert your figures onto a per-100 g basis."
            />
            <Field
              label="Serving name (optional)"
              value={servingLabel}
              onChangeText={setServingLabel}
              placeholder="1 slice"
            />
          </>
        )}

        <Field
          label={`Calories ${perLabel}`}
          value={kcal}
          onChangeText={setKcal}
          keyboardType="decimal-pad"
          suffix="kcal"
          hint="Leave blank to work it out from the macros."
        />
        <Field label={`Protein ${perLabel}`} value={protein} onChangeText={setProtein} keyboardType="decimal-pad" suffix="g" />
        <Field label={`Carbs ${perLabel}`} value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" suffix="g" />
        <Field label={`Fat ${perLabel}`} value={fat} onChangeText={setFat} keyboardType="decimal-pad" suffix="g" />
        <Field label={`Fibre ${perLabel} (optional)`} value={fiber} onChangeText={setFiber} keyboardType="decimal-pad" suffix="g" />

        {impliedKcal !== null && impliedKcal > 0 && (
          <Text style={[styles.implied, { color: colors.textFaint }]}>
            Those macros work out to {impliedKcal} kcal.
          </Text>
        )}

        {kcalDisagrees && (
          <View style={[styles.warning, { borderColor: colors.warning, backgroundColor: colors.surfaceRaised }]}>
            <Text style={[styles.warningText, { color: colors.textMuted }]}>
              You entered {amounts.kcal} kcal but the macros come to {impliedKcal}. One of them is likely a
              typo. Check the label — it will be saved exactly as you typed it.
            </Text>
            <View style={{ height: space.sm }} />
            <Button
              label={`Use ${impliedKcal} kcal instead`}
              variant="subtle"
              onPress={() => setKcal(String(impliedKcal))}
            />
          </View>
        )}
      </Card>

      {error && (
        <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Button label="Save food" onPress={() => void save()} />
      <View style={{ height: space.sm }} />
      <Button label="Cancel" variant="subtle" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  implied: { fontSize: 12, marginTop: space.xs },
  warning: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  warningText: { fontSize: 12, lineHeight: 17 },
  error: { fontSize: 13, marginBottom: space.md, textAlign: 'center' },
});
