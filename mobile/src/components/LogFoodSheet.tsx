import type { Food, Meal } from '@adaptive-macros/engine';
import { isNutritionallyConsistent, scaleNutrients } from '@adaptive-macros/engine';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEAL_LABELS } from '../format';
import { radius, space, useTheme } from '../theme';
import { Button, Stepper, TOUCH_TARGET } from './Controls';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface LogFoodSheetProps {
  food: Food | null;
  defaultMeal: Meal;
  onCancel: () => void;
  onConfirm: (food: Food, grams: number, meal: Meal) => void;
}

/**
 * Portion picker shown after a food is chosen.
 *
 * Opens on the food's largest declared portion rather than 100 g: a packaged
 * item's own serving is what people mean when they log it, and defaulting to
 * 100 g quietly produces a wrong entry for anyone who does not notice.
 */
export const LogFoodSheet = ({ food, defaultMeal, onCancel, onConfirm }: LogFoodSheetProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [grams, setGrams] = useState('');
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [initialisedFor, setInitialisedFor] = useState<string | null>(null);

  if (food && initialisedFor !== food.id) {
    const preferred = food.portions[food.portions.length - 1] ?? { grams: 100 };
    setGrams(String(preferred.grams));
    setMeal(defaultMeal);
    setInitialisedFor(food.id);
  }

  const parsedGrams = Number.parseFloat(grams.replace(',', '.'));
  const validGrams = Number.isFinite(parsedGrams) && parsedGrams > 0 ? parsedGrams : 0;

  const preview = useMemo(
    () => (food ? scaleNutrients(food.per100g, validGrams) : null),
    [food, validGrams],
  );

  const suspect = food ? !isNutritionallyConsistent(food.per100g) : false;

  return (
    <Modal visible={food !== null} animationType="slide" transparent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        {food && (
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.name, { color: colors.text }]}>{food.name}</Text>
            {food.brand && <Text style={[styles.brand, { color: colors.textMuted }]}>{food.brand}</Text>}

            {suspect && (
              <View style={[styles.warning, { borderColor: colors.warning, backgroundColor: colors.surfaceRaised }]}>
                <Text style={[styles.warningText, { color: colors.textMuted }]}>
                  This entry's calories do not match its own macros. Crowd-sourced data is often wrong — check
                  the label before logging it.
                </Text>
              </View>
            )}

            <View style={styles.chips}>
              {food.portions.map((portion) => (
                <Pressable
                  key={portion.label}
                  onPress={() => setGrams(String(portion.grams))}
                  style={[styles.chip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontSize: 13 }}>{portion.label}</Text>
                </Pressable>
              ))}
            </View>

            <Stepper label="Amount" value={grams} onChangeText={setGrams} suffix="g" />

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

            {preview && (
              <Text style={[styles.preview, { color: colors.textMuted }]}>
                {Math.round(preview.kcal)} kcal · P {preview.proteinG.toFixed(1)} g · C{' '}
                {preview.carbsG.toFixed(1)} g · F {preview.fatG.toFixed(1)} g
              </Text>
            )}

            <Button
              label="Add to diary"
              disabled={validGrams <= 0}
              onPress={() => onConfirm(food, validGrams, meal)}
            />
            <View style={{ height: space.sm }} />
            <Button label="Cancel" variant="subtle" onPress={onCancel} />
          </ScrollView>
        )}
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
  warning: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  warningText: { fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md, marginBottom: space.sm },
  chip: {
    // Tappable, so it has to clear the comfortable thumb minimum.
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  preview: { fontSize: 13, marginBottom: space.md, fontVariant: ['tabular-nums'] },
});
