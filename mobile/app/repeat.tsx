import type { ISODate, LogEntry, Meal } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { LoadProblem } from '../src/components/LoadProblem';
import { listLoggedDates, listLogEntries } from '../src/db';
import { formatDate, MEAL_LABELS } from '../src/format';
import { problemText } from '../src/loadProblem';
import { useApp } from '../src/state/AppStore';
import { font, radius, space, useTheme } from '../src/theme';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const isMeal = (value: string | undefined): value is Meal => MEALS.includes(value as Meal);
const isDate = (value: string | undefined): value is ISODate =>
  value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Copies only the foods explicitly selected from an earlier day's log. */
export default function RepeatScreen() {
  const params = useLocalSearchParams<{ from?: string; meal?: string }>();
  const requestedDate = Array.isArray(params.from) ? params.from[0] : params.from;
  const requestedMeal = Array.isArray(params.meal) ? params.meal[0] : params.meal;
  const { colors } = useTheme();
  const router = useRouter();
  const { ready, selectedDate, copyDay } = useApp();

  const [dates, setDates] = useState<ISODate[] | null>(null);
  const [chosenDate, setChosenDate] = useState<ISODate | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loadedEntriesFor, setLoadedEntriesFor] = useState<ISODate | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [datesProblem, setDatesProblem] = useState<string | null>(null);
  const [entriesProblem, setEntriesProblem] = useState<string | null>(null);
  const [copyProblem, setCopyProblem] = useState<string | null>(null);
  const [datesAttempt, setDatesAttempt] = useState(0);
  const [entriesAttempt, setEntriesAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const context = useRef({ ready, selectedDate, version: 0 });
  if (context.current.ready !== ready || context.current.selectedDate !== selectedDate) {
    context.current = { ready, selectedDate, version: context.current.version + 1 };
  }
  useEffect(() => () => { context.current.version += 1; }, []);

  useEffect(() => {
    let cancelled = false;
    setDates(null);
    setChosenDate(null);
    setEntries([]);
    setSelectedIds([]);
    setDatesProblem(null);
    setEntriesProblem(null);
    setCopyProblem(null);
    if (!ready) return () => { cancelled = true; };

    listLoggedDates(30, selectedDate)
      .then((loaded) => {
        if (cancelled) return;
        const eligible = loaded.filter((date) => date < selectedDate);
        setDates(eligible);
        setDatesProblem(null);
        const routeDate = isDate(requestedDate) && requestedDate < selectedDate && eligible.includes(requestedDate)
          ? requestedDate
          : null;
        setChosenDate(routeDate ?? eligible[0] ?? null);
      })
      .catch((error) => {
        if (!cancelled) setDatesProblem(problemText(error));
      });

    return () => { cancelled = true; };
  }, [ready, selectedDate, requestedDate, datesAttempt]);

  useEffect(() => {
    let cancelled = false;
    setEntries([]);
    setLoadedEntriesFor(null);
    setSelectedIds([]);
    setEntriesProblem(null);
    if (!ready || !chosenDate) {
      return () => { cancelled = true; };
    }

    listLogEntries(chosenDate)
      .then((loaded) => {
        if (cancelled) return;
        setEntries(loaded);
        setLoadedEntriesFor(chosenDate);
        setEntriesProblem(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setEntriesProblem(problemText(error));
        }
      });

    return () => { cancelled = true; };
  }, [ready, chosenDate, entriesAttempt]);

  const meals = useMemo(() => {
    const present = MEALS.filter((meal) => entries.some((entry) => entry.meal === meal));
    return isMeal(requestedMeal)
      ? [...present].sort((a, b) => Number(b === requestedMeal) - Number(a === requestedMeal))
      : present;
  }, [entries, requestedMeal]);
  const selected = entries.filter((entry) => selectedIds.includes(entry.id));
  const totalKcal = selected.reduce((sum, entry) => sum + entry.nutrients.kcal, 0);

  const toggleEntry = (id: string) =>
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);

  const copy = async () => {
    if (!ready || busyRef.current || !chosenDate || loadedEntriesFor !== chosenDate || selected.length === 0) return;
    const version = context.current.version;
    busyRef.current = true;
    setBusy(true);
    setCopyProblem(null);
    try {
      const count = await copyDay(chosenDate, undefined, selected.map((entry) => entry.id));
      if (version !== context.current.version) return;
      if (count === 0) throw new Error('Those foods are no longer in the source log. Choose another day.');
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (error) {
      if (version === context.current.version) setCopyProblem(problemText(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Card title="Choose foods to repeat" subtitle={`Onto ${formatDate(selectedDate)}`}>
        {ready && datesProblem !== null && dates === null && (
          <LoadProblem message={datesProblem} onRetry={() => setDatesAttempt((n) => n + 1)} />
        )}
        {ready && datesProblem === null && dates === null && <ActivityIndicator color={colors.accent} />}
        {ready && dates?.length === 0 && (
          <Text style={[styles.body, { color: colors.textFaint }]}>Nothing logged on an earlier day yet.</Text>
        )}
        {ready && !!dates?.length && (
          <View style={styles.chips}>
            {dates.map((date) => (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityState={{ selected: date === chosenDate }}
                onPress={() => setChosenDate(date)}
                style={[styles.chip, {
                  backgroundColor: date === chosenDate ? colors.accent : colors.surfaceRaised,
                  borderColor: colors.border,
                }]}
              >
                <Text style={{ fontFamily: font.figure, fontVariant: ['tabular-nums'], color: date === chosenDate ? colors.onFill : colors.text, fontSize: 13 }}>
                  {formatDate(date)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      {ready && chosenDate && (
        <Card title="Select individual foods" subtitle="Nothing is selected until you choose it.">
          {entriesProblem !== null && (
            <LoadProblem message={entriesProblem} onRetry={() => setEntriesAttempt((n) => n + 1)} />
          )}
          {entriesProblem === null && loadedEntriesFor !== chosenDate && <ActivityIndicator color={colors.accent} />}
          {entriesProblem === null && loadedEntriesFor === chosenDate && entries.length === 0 && dates !== null && (
            <Text style={[styles.body, { color: colors.textFaint }]}>No foods logged on this day.</Text>
          )}
          {loadedEntriesFor === chosenDate && meals.map((meal) => {
            const mealEntries = entries.filter((entry) => entry.meal === meal);
            const allSelected = mealEntries.every((entry) => selectedIds.includes(entry.id));
            return (
              <View key={meal} style={styles.mealGroup}>
                <View style={styles.mealHeader}>
                  <Text style={[styles.mealTitle, { color: colors.text }]}>{MEAL_LABELS[meal]}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedIds((current) => allSelected
                      ? current.filter((id) => !mealEntries.some((entry) => entry.id === id))
                      : [...new Set([...current, ...mealEntries.map((entry) => entry.id)])])}
                    style={styles.selectMeal}
                  >
                    <Text style={[styles.selectMealText, { color: colors.accent }]}>{allSelected ? 'Clear' : 'Select all'}</Text>
                  </Pressable>
                </View>
                {mealEntries.map((entry) => {
                  const checked = selectedIds.includes(entry.id);
                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      onPress={() => toggleEntry(entry.id)}
                      style={[styles.entry, { borderColor: colors.border }]}
                    >
                      <View style={[styles.check, { borderColor: checked ? colors.accent : colors.border, backgroundColor: checked ? colors.accent : 'transparent' }]}>
                        {checked && <Text style={[styles.tick, { color: colors.onFill }]}>✓</Text>}
                      </View>
                      <View style={styles.entryText}>
                        <Text style={[styles.entryName, { color: colors.text }]} numberOfLines={1}>{entry.foodName}</Text>
                        <Text style={[styles.entryDetail, { color: colors.textMuted }]}>{Math.round(entry.grams)} g · {Math.round(entry.nutrients.kcal)} kcal</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
          {entriesProblem === null && loadedEntriesFor === chosenDate && entries.length > 0 && (
            <Text style={[styles.total, { color: colors.text }]}>
              {selected.length} selected · {Math.round(totalKcal)} kcal
            </Text>
          )}
          {copyProblem !== null && <LoadProblem message={copyProblem} onRetry={() => void copy()} />}
          <View style={{ height: space.md }} />
          <Button label={busy ? 'Adding…' : 'Add selected foods'} disabled={!ready || busy || loadedEntriesFor !== chosenDate || selected.length === 0} onPress={() => void copy()} />
        </Card>
      )}

      <Button label="Cancel" variant="subtle" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },
  body: { fontFamily: font.ui, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mealGroup: { marginTop: space.md },
  mealHeader: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealTitle: { fontFamily: font.uiStrong, fontSize: 14 },
  selectMeal: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: space.sm },
  selectMealText: { fontFamily: font.uiStrong, fontSize: 12 },
  entry: { minHeight: TOUCH_TARGET + 8, flexDirection: 'row', alignItems: 'center', gap: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  check: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tick: { fontFamily: font.uiStrong, fontSize: 14, lineHeight: 17 },
  entryText: { flex: 1, gap: 2 },
  entryName: { fontFamily: font.uiStrong, fontSize: 14 },
  entryDetail: { fontFamily: font.ui, fontSize: 12 },
  total: { fontFamily: font.uiStrong, fontSize: 15, marginTop: space.md },
});
