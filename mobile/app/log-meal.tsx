import type { LogEntry, Meal } from '@adaptive-macros/engine';
import { addDays } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { LoadProblem } from '../src/components/LoadProblem';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { listLogEntriesBetween } from '../src/db';
import { MEAL_LABELS } from '../src/format';
import { problemText } from '../src/loadProblem';
import { defaultMealForHour, usualFoods, type UsualFood } from '../src/usualFoods';
import { useApp } from '../src/state/AppStore';
import { font, radius, space, useTheme } from '../src/theme';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const isMeal = (value: string | undefined): value is Meal => MEALS.includes(value as Meal);

export default function LogMealScreen() {
  const params = useLocalSearchParams<{ meal?: string }>();
  const requestedMeal = Array.isArray(params.meal) ? params.meal[0] : params.meal;
  const meal: Meal = isMeal(requestedMeal) ? requestedMeal : defaultMealForHour(new Date().getHours());
  const router = useRouter();
  const { colors } = useTheme();
  const { ready, selectedDate, entries, copyDay } = useApp();
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyProblem, setHistoryProblem] = useState<string | null>(null);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [addingIds, setAddingIds] = useState<string[]>([]);
  const [addProblem, setAddProblem] = useState<{ suggestion: UsualFood; message: string } | null>(null);
  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);
  const addingRef = useRef(new Set<string>());
  const contextRef = useRef({ ready, selectedDate, version: 0 });
  if (contextRef.current.ready !== ready || contextRef.current.selectedDate !== selectedDate) {
    contextRef.current = { ready, selectedDate, version: contextRef.current.version + 1 };
  }
  useEffect(() => () => { contextRef.current.version += 1; }, []);

  useEffect(() => {
    setAddProblem(null);
    setAddedFeedback(null);
    setAddingIds([]);
  }, [ready, selectedDate]);

  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    setHistoryProblem(null);
    if (!ready) {
      setHistoryLoading(false);
      return () => { cancelled = true; };
    }

    setHistoryLoading(true);
    listLogEntriesBetween(addDays(selectedDate, -28), addDays(selectedDate, -1))
      .then((loaded) => {
        if (cancelled) return;
        setHistory(loaded);
        setHistoryProblem(null);
        setHistoryLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setHistoryProblem(problemText(error));
        setHistoryLoading(false);
      });

    return () => { cancelled = true; };
  }, [ready, selectedDate, historyAttempt]);

  const suggestions = useMemo(
    () => ready ? usualFoods(history, selectedDate, meal, entries) : [],
    [ready, history, selectedDate, meal, entries],
  );

  const addSuggestion = async (suggestion: UsualFood) => {
    const source = suggestion.entry;
    if (!ready || addingRef.current.has(source.id)) return;
    const version = contextRef.current.version;
    addingRef.current.add(source.id);
    setAddingIds((current) => [...current, source.id]);
    setAddProblem(null);
    setAddedFeedback(null);
    try {
      const count = await copyDay(source.date, [meal], [source.id]);
      if (count === 0) throw new Error('That food is no longer in the source log. Choose another food.');
      if (version === contextRef.current.version) {
        setAddedFeedback(`Added ${source.foodName} · ${Math.round(source.grams)} g to ${MEAL_LABELS[meal]}.`);
      }
    } catch (error) {
      if (version === contextRef.current.version) {
        setAddProblem({ suggestion, message: problemText(error) });
      }
    } finally {
      addingRef.current.delete(source.id);
      setAddingIds((current) => current.filter((id) => id !== source.id));
    }
  };

  return (
    <Screen topInset={false}>
      <Text style={[styles.title, { color: colors.text }]}>Log {meal === 'snack' ? 'a snack' : meal}</Text>
      <Card title="Usual foods" subtitle="From your recent log.">
        {ready && historyProblem !== null && <LoadProblem message={historyProblem} onRetry={() => setHistoryAttempt((n) => n + 1)} />}
        {ready && historyLoading && <Text style={[styles.description, { color: colors.textMuted }]}>Looking through your recent log…</Text>}
        {ready && historyProblem === null && !historyLoading && suggestions.length === 0 && (
          <Text style={[styles.description, { color: colors.textMuted }]}>No usual foods to show yet.</Text>
        )}
        {ready && historyProblem === null && suggestions.map((suggestion) => {
          const source = suggestion.entry;
          const adding = addingIds.includes(source.id);
          return (
            <View key={`${source.foodId}-${source.foodName}`} style={[styles.suggestion, { borderColor: colors.border }]}>
              <View style={styles.suggestionText}>
                <Text style={[styles.foodName, { color: colors.text }]} numberOfLines={1}>{source.foodName}</Text>
                <Text style={[styles.detail, { color: colors.textMuted }]} numberOfLines={1}>
                  {Math.round(source.grams)} g · {Math.round(source.nutrients.kcal)} kcal · Logged {suggestion.days} {suggestion.days === 1 ? 'day' : 'days'}
                </Text>
              </View>
              <Tappable
                accessibilityRole="button"
                accessibilityLabel={`${adding ? 'Adding' : 'Add'} ${source.foodName}`}
                disabled={adding || !ready}
                onPress={() => void addSuggestion(suggestion)}
                style={[styles.addButton, { backgroundColor: colors.surfaceRaised, opacity: adding || !ready ? 0.4 : 1 }]}
              >
                <Text style={[styles.addText, { color: colors.text }]}>{adding ? 'Adding…' : 'Add'}</Text>
              </Tappable>
            </View>
          );
        })}
        {addProblem !== null && (
          <LoadProblem message={addProblem.message} onRetry={() => void addSuggestion(addProblem.suggestion)} />
        )}
        {addedFeedback !== null && <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: colors.accent }]}>{addedFeedback}</Text>}
        <Pressable
          accessibilityRole="link"
          onPress={() => router.replace({ pathname: '/repeat', params: { from: addDays(selectedDate, -1), meal } })}
          style={styles.repeatLink}
        >
          <Text style={[styles.repeatText, { color: colors.accent }]}>Choose from yesterday</Text>
        </Pressable>
      </Card>
      <Card variant="featured" tone="food" title="AI meal estimate" icon="restaurant-outline">
        <Text style={[styles.description, { color: colors.textMuted }]}>
          Estimate foods and portions, then check them before saving.
        </Text>
        <View style={styles.actions}>
          <Button label="Take a photo" icon="camera-outline" onPress={() => router.replace({ pathname: '/describe', params: { meal, capture: 'camera' } })} />
          <Button label="Describe your meal" icon="create-outline" variant="subtle" onPress={() => router.replace({ pathname: '/describe', params: { meal } })} />
        </View>
      </Card>
      <Card title="Other ways to log">
        <Text style={[styles.description, { color: colors.textMuted }]}>Have a label or know the food?</Text>
        <View style={styles.alternatives}>
          <Button label="Scan a barcode" icon="barcode-outline" variant="subtle" onPress={() => router.replace({ pathname: '/scan', params: { meal } })} />
          <Button label="Search foods" icon="search-outline" variant="subtle" onPress={() => router.replace({ pathname: '/search', params: { meal } })} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.uiStrong, fontSize: 24, lineHeight: 30, letterSpacing: -0.5, marginBottom: space.sm },
  description: { fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
  suggestion: { minHeight: TOUCH_TARGET + 4, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  suggestionText: { flex: 1, gap: 2 },
  foodName: { fontFamily: font.uiStrong, fontSize: 14 },
  detail: { fontFamily: font.ui, fontSize: 11 },
  addButton: { minWidth: 54, minHeight: TOUCH_TARGET, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  addText: { fontFamily: font.uiStrong, fontSize: 12 },
  feedback: { fontFamily: font.uiStrong, fontSize: 13, marginTop: space.sm },
  repeatLink: { minHeight: TOUCH_TARGET, justifyContent: 'center', marginTop: space.sm },
  repeatText: { fontFamily: font.uiStrong, fontSize: 13 },
  actions: { gap: space.xs, marginTop: space.lg },
  alternatives: { marginTop: space.md },
});
