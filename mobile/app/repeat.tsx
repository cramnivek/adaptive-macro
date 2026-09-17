import type { LogEntry, Meal } from '@adaptive-macros/engine';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Controls';
import { listLoggedDates, listLogEntries } from '../src/db';
import { MEAL_LABELS, formatDate } from '../src/format';
import { useApp } from '../src/state/AppStore';
import { radius, space, useTheme } from '../src/theme';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Copies a previous day's meals onto the day being viewed.
 *
 * Most people eat the same handful of breakfasts. Searching for them again
 * every morning is the single largest recurring cost of tracking, and it is the
 * friction that ends most logging streaks.
 */
export default function RepeatScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { selectedDate, copyDay } = useApp();

  const [dates, setDates] = useState<string[] | null>(null);
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [chosenMeals, setChosenMeals] = useState<Meal[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listLoggedDates(30, selectedDate).then(setDates);
  }, [selectedDate]);

  useEffect(() => {
    if (!chosenDate) return;
    void listLogEntries(chosenDate).then((loaded) => {
      setEntries(loaded);
      // Everything that day had is selected by default: "repeat yesterday" is
      // the common case, and deselecting is easier than selecting four times.
      setChosenMeals([...new Set(loaded.map((entry) => entry.meal))]);
    });
  }, [chosenDate]);

  const mealsPresent = MEALS.filter((meal) => entries.some((entry) => entry.meal === meal));
  const selected = entries.filter((entry) => chosenMeals.includes(entry.meal));
  const totalKcal = selected.reduce((sum, entry) => sum + entry.nutrients.kcal, 0);

  const copy = async () => {
    if (!chosenDate || chosenMeals.length === 0) return;
    setBusy(true);
    try {
      await copyDay(chosenDate, chosenMeals);
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Card title="Copy a previous day" subtitle={`Onto ${formatDate(selectedDate)}`}>
        {dates === null && <ActivityIndicator color={colors.accent} />}
        {dates?.length === 0 && (
          <Text style={[styles.body, { color: colors.textFaint }]}>
            Nothing logged on any other day yet.
          </Text>
        )}
        <View style={styles.chips}>
          {dates?.map((date) => (
            <Pressable
              key={date}
              onPress={() => setChosenDate(date)}
              style={[
                styles.chip,
                {
                  backgroundColor: date === chosenDate ? colors.accent : colors.surfaceRaised,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={{ color: date === chosenDate ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                {formatDate(date)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {chosenDate && (
        <Card title="Which meals" subtitle="Tap to include or leave out.">
          <View style={styles.chips}>
            {mealsPresent.map((meal) => {
              const on = chosenMeals.includes(meal);
              const kcal = entries
                .filter((entry) => entry.meal === meal)
                .reduce((sum, entry) => sum + entry.nutrients.kcal, 0);
              return (
                <Pressable
                  key={meal}
                  onPress={() =>
                    setChosenMeals((current) =>
                      current.includes(meal)
                        ? current.filter((m) => m !== meal)
                        : [...current, meal],
                    )
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: on ? colors.accent : colors.surfaceRaised,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: on ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                    {MEAL_LABELS[meal]} · {Math.round(kcal)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selected.map((entry) => (
            <Text key={entry.id} style={[styles.item, { color: colors.textMuted }]} numberOfLines={1}>
              {entry.foodName} — {Math.round(entry.grams)} g, {Math.round(entry.nutrients.kcal)} kcal
            </Text>
          ))}

          <Text style={[styles.total, { color: colors.text }]}>
            {selected.length} item{selected.length === 1 ? '' : 's'} · {Math.round(totalKcal)} kcal
          </Text>

          <View style={{ height: space.md }} />
          <Button
            label={busy ? 'Copying…' : 'Copy to this day'}
            disabled={busy || selected.length === 0}
            onPress={() => void copy()}
          />
        </Card>
      )}

      <Button label="Cancel" variant="subtle" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  body: { fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: { fontSize: 12, marginTop: space.xs },
  total: { fontSize: 15, fontWeight: '600', marginTop: space.md },
});
