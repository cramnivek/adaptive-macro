import type { Food, Meal } from '@adaptive-macros/engine';
import { kcalFromMacros, roundTo } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field, Stepper, TOUCH_TARGET } from '../src/components/Controls';
import { MEAL_LABELS } from '../src/format';
import { useApp } from '../src/state/AppStore';
import { radius, space, useTheme } from '../src/theme';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Logs bare calories and macros without a food behind them.
 *
 * For the case no database can help with: a colleague's birthday cake, a meal
 * out you were told the calories for, a rough figure you would rather record
 * than skip. Skipping is the real cost — a missing day is worse for the
 * expenditure estimate than an approximate one, because the filter treats an
 * unlogged day as unknown and widens rather than learning from it.
 */
export default function QuickAddScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string }>();

  const { logFood } = useApp();
  const [meal, setMeal] = useState<Meal>((params.meal as Meal) ?? 'snack');
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const num = (text: string): number | null => {
    const trimmed = text.trim();
    if (trimmed === '') return 0;
    const value = Number.parseFloat(trimmed.replace(',', '.'));
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  const macros = { proteinG: num(protein), carbsG: num(carbs), fatG: num(fat) };
  const impliedKcal =
    macros.proteinG !== null && macros.carbsG !== null && macros.fatG !== null
      ? roundTo(
          kcalFromMacros({
            kcal: 0,
            proteinG: macros.proteinG,
            carbsG: macros.carbsG,
            fatG: macros.fatG,
          }),
        )
      : null;

  const save = async () => {
    setError(null);
    const energy = num(kcal);
    if (energy === null || macros.proteinG === null || macros.carbsG === null || macros.fatG === null) {
      setError('Calories and macros must be numbers, or blank for zero.');
      return;
    }

    const finalKcal = energy > 0 ? energy : (impliedKcal ?? 0);
    if (finalKcal <= 0) {
      setError('Enter some calories, or the macros to work them out from.');
      return;
    }

    // Stored as a food logged at 100 g, so the entry behaves like any other:
    // it can be edited, rescaled, and shows correct totals. The alternative —
    // an entry with no food behind it — would be a special case everywhere.
    const food: Food = {
      id: `quick:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || 'Quick add',
      source: 'custom',
      per100g: {
        kcal: finalKcal,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        fiberG: 0,
      },
      portions: [{ label: 'As entered', grams: 100 }],
      fetchedAt: new Date().toISOString(),
    };

    await logFood(food, 100, meal);
    router.back();
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card title="Quick add" subtitle="Calories straight in, no food to look up.">
        <Field
          label="What was it (optional)"
          value={name}
          onChangeText={setName}
          placeholder="Birthday cake at the office"
        />
        <View style={styles.chips}>
          {MEALS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setMeal(option)}
              style={[
                styles.chip,
                {
                  backgroundColor: option === meal ? colors.accent : colors.surfaceRaised,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={{ color: option === meal ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                {MEAL_LABELS[option]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Stepper
          label="Calories"
          value={kcal}
          onChangeText={setKcal}
          suffix="kcal"
          hint="Leave at zero to work it out from the macros below."
        />
        <Stepper label="Protein" value={protein} onChangeText={setProtein} suffix="g" />
        <Stepper label="Carbs" value={carbs} onChangeText={setCarbs} suffix="g" />
        <Stepper label="Fat" value={fat} onChangeText={setFat} suffix="g" />

        {impliedKcal !== null && impliedKcal > 0 && (
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Those macros come to {impliedKcal} kcal.
          </Text>
        )}

        {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

        <View style={{ height: space.md }} />
        <Button label="Add to diary" onPress={() => void save()} />
        <View style={{ height: space.sm }} />
        <Button label="Cancel" variant="subtle" onPress={() => router.back()} />
      </Card>

      <Text style={[styles.note, { color: colors.textFaint, paddingHorizontal: space.xs }]}>
        A rough figure beats no figure. The expenditure estimate treats an unlogged day as unknown and
        widens its uncertainty, so an approximate entry tells it more than a missing one.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: {
    // Tappable, so it has to clear the comfortable thumb minimum.
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  note: { fontSize: 12, lineHeight: 17, marginTop: space.xs },
  error: { fontSize: 13, marginTop: space.sm },
});
