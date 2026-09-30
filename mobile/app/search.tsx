import type { Food, Meal } from '@adaptive-macros/engine';
import { isNutritionallyConsistent } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { UngroundedResponseError, lookupFood } from '../src/api/gemini';
import { searchFoods } from '../src/api/search';
import { Button, Field } from '../src/components/Controls';
import { LogFoodSheet } from '../src/components/LogFoodSheet';
import { LookupCandidateSheet } from '../src/components/LookupCandidateSheet';
import { getFoodById, listFrequentFoods, saveFood } from '../src/db';
import { useApp } from '../src/state/AppStore';
import { font, radius, space, useTheme } from '../src/theme';

const SOURCE_LABELS: Record<Food['source'], string> = {
  custom: 'Saved',
  recipe: 'Recipe',
  ai: 'Estimate',
  usda: 'USDA',
  openfoodfacts: 'OFF',
};

export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; justCreated?: string }>();
  const meal = (params.meal as Meal) ?? 'snack';

  const { settings, logFood } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [frequent, setFrequent] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [candidate, setCandidate] = useState<Food | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupElapsed, setLookupElapsed] = useState(0);

  // The grounded lookup can take up to 90s. Without a visible clock that reads
  // as a hang, and the user taps again or gives up on the feature. Mirrors the
  // same counter on the describe screen.
  useEffect(() => {
    if (!lookingUp) return;
    setLookupElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setLookupElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [lookingUp]);

  // Every keystroke would fire three network searches, so a trailing debounce
  // waits for a pause in typing. The ref lets each new keystroke cancel the
  // pending one rather than queueing another.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Responses can land out of order; only the newest query is allowed to write.
  // The lookup below reuses this same ref: it takes 10-30s and the field stays
  // editable throughout, so a result for an abandoned query must not surface.
  const latestQuery = useRef('');
  // A lookup can still be in flight when the user navigates away (saving a
  // food calls router.back(); "Create a food" pushes a new screen). Without
  // this, its eventual resolution would set state on an unmounted screen.
  const mounted = useRef(true);
  // How many times the auto-lookup has fired for a query on this screen. A
  // failed attempt leaves room for one retry — a transient network error is
  // exactly when a retry is wanted. A success closes the query outright, or
  // cancelling the candidate sheet would spend another call.
  const autoAttempts = useRef<Map<string, number>>(new Map());
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    void listFrequentFoods().then(setFrequent);
  }, []);

  // Arriving back from the create screen: open the portion sheet straight away
  // for the food just made, rather than making the user search for it.
  useEffect(() => {
    if (!params.justCreated) return;
    void getFoodById(params.justCreated).then((food) => {
      if (food) setSelected(food);
    });
  }, [params.justCreated]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const trimmed = query.trim();
    latestQuery.current = trimmed;

    if (trimmed.length < 2) {
      setResults([]);
      setErrors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounce.current = setTimeout(async () => {
      const found = await searchFoods(trimmed, settings.usdaApiKey, settings.foodCountry);
      if (latestQuery.current !== trimmed) return;
      setResults(found.foods);
      setErrors(found.errors);
      setLoading(false);
    }, 350);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, settings.usdaApiKey, settings.foodCountry]);

  const confirm = useCallback(
    async (food: Food, grams: number, chosenMeal: Meal) => {
      await logFood(food, grams, chosenMeal);
      setSelected(null);
      router.back();
    },
    [logFood, router],
  );

  const shown = query.trim().length < 2 ? frequent : results;
  const showingFrequent = query.trim().length < 2;

  // Three rather than zero: the case this exists for returned one irrelevant
  // result, not an empty list.
  const THIN_RESULT_COUNT = 3;
  // On top of the 350ms search debounce, so the full sequence is: stop typing,
  // 350ms, database search, settles empty, then this before a call is spent.
  const AUTO_LOOKUP_DELAY_MS = 1200;
  /** Two attempts per query: the first, and one retry if that one failed. */
  const MAX_AUTO_ATTEMPTS = 2;
  // Zero results is now handled automatically below. The button survives for
  // one or two results, where a real database hit might still be the right
  // answer and spending a call would be presumptuous.
  const canLookUp =
    !showingFrequent && !loading && shown.length > 0 && shown.length < THIN_RESULT_COUNT;

  const runLookup = useCallback(async () => {
    const trimmed = query.trim();
    setLookingUp(true);
    setErrors([]);
    try {
      const food = await lookupFood(trimmed, settings.foodCountry, settings.foodLookup.geminiApiKey);
      // The user may have retyped the query, or left the screen, while this
      // was in flight. Either way, a result for what they searched a moment
      // ago has nothing to do with what is on screen now.
      if (!mounted.current || latestQuery.current !== trimmed) return;
      // A found food ends the question. Without this, cancelling the candidate
      // sheet would leave results empty and let the effect fire again.
      autoAttempts.current.set(trimmed, MAX_AUTO_ATTEMPTS);
      setCandidate(food);
    } catch (error) {
      if (!mounted.current || latestQuery.current !== trimmed) return;
      setErrors([
        error instanceof UngroundedResponseError
          ? 'Could not find published figures for that. Try a more specific name, or add it yourself.'
          : (error as Error).message,
      ]);
    } finally {
      if (mounted.current) setLookingUp(false);
    }
  }, [query, settings.foodCountry, settings.foodLookup.geminiApiKey]);

  // AI is not a thing you ask for here; it is what happens when the databases
  // have nothing. Only on zero results, only once per distinct query, and only
  // after typing has settled, so nothing fires mid-word.
  useEffect(() => {
    const trimmed = query.trim();
    if (showingFrequent || loading || lookingUp) return;
    if (results.length > 0 || trimmed.length < 2) return;
    if ((autoAttempts.current.get(trimmed) ?? 0) >= MAX_AUTO_ATTEMPTS) return;

    const timer = setTimeout(() => {
      if (!mounted.current || latestQuery.current !== trimmed) return;
      autoAttempts.current.set(trimmed, (autoAttempts.current.get(trimmed) ?? 0) + 1);
      void runLookup();
    }, AUTO_LOOKUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [query, showingFrequent, loading, lookingUp, results.length, runLookup]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchBar}>
        <Field
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder="Greek yogurt, chicken breast, oats…"
        />
      </View>

      {errors.map((error) => (
        <Text key={error} style={[styles.error, { color: colors.warning }]}>
          {error}
        </Text>
      ))}

      {loading && <ActivityIndicator style={styles.spinner} color={colors.accent} />}

      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          shown.length > 0 && showingFrequent ? (
            <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>Your frequent foods</Text>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <Text style={[styles.empty, { color: colors.textFaint }]}>
              {showingFrequent
                ? 'Search for a food, or scan a barcode from the Today tab.'
                : lookingUp
                  ? `Nothing found — looking it up… ${lookupElapsed}s`
                  : 'Nothing found. Try a shorter or more general term, or add it yourself.'}
            </Text>
          )
        }
        ListFooterComponent={
          loading ? null : (
            <View style={styles.footer}>
              <Text style={[styles.footerNote, { color: colors.textFaint }]}>
                Homemade, local or sold loose? The databases will not have it.
              </Text>
              <Button
                label="Create a food"
                variant="subtle"
                onPress={() => router.push({ pathname: '/food-new', params: { meal } })}
              />
              {canLookUp && (
                <Button
                  label={lookingUp ? `Looking it up… ${lookupElapsed}s` : 'Look it up with AI'}
                  variant="subtle"
                  disabled={lookingUp}
                  onPress={() => void runLookup()}
                />
              )}
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelected(item)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={[styles.rowMeta, { color: colors.textFaint }]}>
                {item.brand ? `${item.brand} · ` : ''}
                {Math.round(item.per100g.kcal)} kcal / 100 g · P {Math.round(item.per100g.proteinG)} · C{' '}
                {Math.round(item.per100g.carbsG)} · F {Math.round(item.per100g.fatG)}
              </Text>
              {item.source === 'ai' && (
                <Text style={[styles.rowWarning, { color: colors.warning }]}>
                  Estimated by a model, not looked up. Check it before trusting it.
                </Text>
              )}
              {!isNutritionallyConsistent(item.per100g) && (
                <Text style={[styles.rowWarning, { color: colors.warning }]}>
                  Its macros do not add up to its calories — one of the two is wrong.
                </Text>
              )}
            </View>
            <Text style={[styles.badge, { color: colors.textFaint, borderColor: colors.border }]}>
              {SOURCE_LABELS[item.source]}
            </Text>
          </Pressable>
        )}
      />

      <LogFoodSheet
        food={selected}
        defaultMeal={meal}
        onCancel={() => setSelected(null)}
        onConfirm={(food, grams, chosenMeal) => void confirm(food, grams, chosenMeal)}
      />

      <LookupCandidateSheet
        food={candidate}
        onCancel={() => setCandidate(null)}
        onSave={(food) =>
          void saveFood(food)
            .then(() => {
              setCandidate(null);
              setSelected(food);
            })
            .catch(() => setErrors(['Could not save that food. Try again.']))
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: { paddingHorizontal: space.lg, paddingTop: space.lg },
  error: { fontFamily: font.ui, fontSize: 12, paddingHorizontal: space.lg, paddingBottom: space.xs },
  spinner: { marginVertical: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  sectionLabel: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    marginBottom: space.sm,
  },
  rowText: { flex: 1 },
  rowName: { fontFamily: font.uiStrong, fontSize: 15 },
  rowMeta: { fontFamily: font.ui, fontSize: 11, marginTop: 2 },
  rowWarning: { fontFamily: font.ui, fontSize: 11, marginTop: 3, lineHeight: 15 },
  badge: {
    fontFamily: font.ui,
    fontSize: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  empty: { fontFamily: font.ui, fontSize: 13, textAlign: 'center', marginTop: space.xl, lineHeight: 19 },
  footer: { marginTop: space.lg, gap: space.sm },
  footerNote: { fontFamily: font.ui, fontSize: 12, textAlign: 'center' },
});
