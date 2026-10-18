import type { Food, LogEntry, Meal, Nutrients } from '@adaptive-macros/engine';
import { scaleMicros } from '@adaptive-macros/engine';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEAL_LABELS } from '../format';
import { font, radius, space, useTheme } from '../theme';
import { Button, Stepper, TOUCH_TARGET } from './Controls';
import { FoodMicronutrientsView } from './FoodMicronutrientsView';
import { getFoodById } from '../db';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface EditEntrySheetProps {
  entry: LogEntry | null;
  onCancel: () => void;
  onSave: (entry: LogEntry, grams: number, meal: Meal) => void;
  onDelete: (entry: LogEntry) => void;
}

/**
 * Edits a logged entry's portion and meal.
 *
 * Without this the only correction available is delete-and-re-add, which for a
 * mistyped portion means finding the food again. The preview scales from the
 * entry's own stored totals so the numbers move as you type; the authoritative
 * rescale happens on save, from the food's per-100 g basis where it is still
 * cached.
 */
export const EditEntrySheet = ({ entry, onCancel, onSave, onDelete }: EditEntrySheetProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [grams, setGrams] = useState('');
  const [meal, setMeal] = useState<Meal>('snack');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [cachedFood, setCachedFood] = useState<Food | null>(null);

  useEffect(() => {
    if (!entry) {
      setCachedFood(null);
      return;
    }
    let live = true;
    void getFoodById(entry.foodId).then((food) => {
      if (live) setCachedFood(food);
    });
    return () => {
      live = false;
    };
  }, [entry?.foodId]);

  if (entry && loadedFor !== entry.id) {
    setGrams(String(Math.round(entry.grams * 10) / 10));
    setMeal(entry.meal);
    setLoadedFor(entry.id);
  }

  const parsed = Number.parseFloat(grams.replace(',', '.'));
  const validGrams = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const preview: Nutrients | null =
    entry && entry.grams > 0
      ? (() => {
          const factor = validGrams / entry.grams;
          const baseMicros =
            entry.nutrients.micros ??
            (cachedFood?.per100g.micros
              ? scaleMicros(cachedFood.per100g.micros, entry.grams / 100)
              : undefined);

          return {
            kcal: entry.nutrients.kcal * factor,
            proteinG: entry.nutrients.proteinG * factor,
            carbsG: entry.nutrients.carbsG * factor,
            fatG: entry.nutrients.fatG * factor,
            fiberG: (entry.nutrients.fiberG ?? 0) * factor,
            micros: scaleMicros(baseMicros, factor),
          };
        })()
      : null;

  return (
    <Modal visible={entry !== null} animationType="slide" transparent onRequestClose={onCancel}>
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
        {entry && (
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.name, { color: colors.text }]}>{entry.foodName}</Text>

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
                  <Text style={{ fontFamily: font.uiStrong, color: option === meal ? colors.onFill : colors.text, fontSize: 13 }}>
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

            <FoodMicronutrientsView
              micros={preview?.micros}
              collapsible
              defaultExpanded={true}
              title="Micronutrients"
            />

            <View style={{ height: space.sm }} />
            <Button
              label="Save changes"
              disabled={validGrams <= 0}
              onPress={() => onSave(entry, validGrams, meal)}
            />
            <View style={{ height: space.sm }} />
            <Button label="Remove from diary" variant="danger" onPress={() => onDelete(entry)} />
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
    maxHeight: '88%',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  name: { fontFamily: font.uiStrong, fontSize: 18, marginBottom: space.md },
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
  preview: { fontFamily: font.figure, fontSize: 13, marginBottom: space.md, fontVariant: ['tabular-nums'] },
});
