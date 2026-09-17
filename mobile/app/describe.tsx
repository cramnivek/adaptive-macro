import type { Food, Meal, Nutrients } from '@adaptive-macros/engine';
import { roundTo } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  type EstimatedItem,
  type MealEstimate,
  describeErrorMessage,
  estimateCostUsd,
  estimateMeal,
} from '../src/ai/describeMeal';
import { Card } from '../src/components/Card';
import { Button, Field, TOUCH_TARGET } from '../src/components/Controls'
import { addLogEntry, saveFood } from '../src/db';
import { MEAL_LABELS } from '../src/format';
import { useApp } from '../src/state/AppStore';
import { radius, space, useTheme } from '../src/theme';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** An estimated item plus the portion the user settled on. */
interface DraftItem {
  item: EstimatedItem;
  grams: number;
  included: boolean;
}

/**
 * Scales an item's macros to the portion the user chose.
 *
 * Claude estimated the macros for the portion it assumed. When the user changes
 * the weight, the macros move with it proportionally — the estimate of what the
 * food is stays Claude's, only the amount changes. The original portion is kept
 * on screen so an adjusted row never looks like the estimate itself changed.
 */
const scaleItem = (item: EstimatedItem, grams: number): Nutrients => {
  if (item.grams <= 0) {
    return { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
  }
  const factor = grams / item.grams;
  return {
    kcal: item.kcal * factor,
    proteinG: item.proteinG * factor,
    carbsG: item.carbsG * factor,
    fatG: item.fatG * factor,
    fiberG: item.fiberG * factor,
  };
};

export default function DescribeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string }>();

  const { settings, selectedDate, refreshAll } = useApp();
  const [meal, setMeal] = useState<Meal>((params.meal as Meal) ?? 'snack');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [costUsd, setCostUsd] = useState<number | null>(null);
  const [ranOn, setRanOn] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // A local 32B model takes 10-45 seconds. Without a visible clock that reads
  // as a hang, and the user taps again or gives up on the feature.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [busy]);

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setEstimate(null);
    setDrafts([]);

    try {
      const result = await estimateMeal(text, {
        provider: settings.aiProvider,
        anthropicApiKey: settings.anthropicApiKey,
        ollamaHost: settings.ollamaHost,
        ollamaModel: settings.ollamaModel,
      });
      setEstimate(result.estimate);
      setRanOn(result.model);
      // A local model has no per-request price, so there is no cost to show —
      // deliberately not a "$0.0000", which would read as a failed lookup.
      setCostUsd(
        settings.aiProvider === 'anthropic' ? estimateCostUsd(result.usage, result.model) : null,
      );
      setDrafts(
        result.estimate.items.map((item) => ({ item, grams: item.grams, included: true })),
      );
    } catch (caught) {
      setError(describeErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const logAll = async () => {
    const chosen = drafts.filter((draft) => draft.included && draft.grams > 0);
    if (chosen.length === 0) return;

    setBusy(true);
    try {
      for (const draft of chosen) {
        const nutrients = scaleItem(draft.item, draft.grams);
        // Stored per 100 g like every other food, so it behaves identically
        // everywhere else in the app and can be searched for again later.
        const per100g: Nutrients = {
          kcal: (nutrients.kcal / draft.grams) * 100,
          proteinG: (nutrients.proteinG / draft.grams) * 100,
          carbsG: (nutrients.carbsG / draft.grams) * 100,
          fatG: (nutrients.fatG / draft.grams) * 100,
          fiberG: ((nutrients.fiberG ?? 0) / draft.grams) * 100,
        };

        const food: Food = {
          id: `ai:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: draft.item.name,
          source: 'ai',
          per100g,
          portions: [
            { label: '100 g', grams: 100 },
            { label: `As estimated (${Math.round(draft.item.grams)} g)`, grams: draft.item.grams },
          ],
          fetchedAt: new Date().toISOString(),
        };

        await saveFood(food);
        await addLogEntry({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          date: selectedDate,
          foodId: food.id,
          foodName: food.name,
          grams: draft.grams,
          meal,
          nutrients,
        });
      }

      await refreshAll();
      router.back();
    } catch (caught) {
      setError(describeErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const totals = drafts
    .filter((draft) => draft.included)
    .reduce(
      (sum, draft) => {
        const n = scaleItem(draft.item, draft.grams);
        return {
          kcal: sum.kcal + n.kcal,
          proteinG: sum.proteinG + n.proteinG,
          carbsG: sum.carbsG + n.carbsG,
          fatG: sum.fatG + n.fatG,
        };
      },
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

  const confidenceColor = (confidence: EstimatedItem['confidence']) =>
    confidence === 'high' ? colors.positive : confidence === 'medium' ? colors.warning : colors.danger;

  const usingLocal = settings.aiProvider === 'ollama';
  const ready = usingLocal
    ? settings.ollamaModel.trim().length > 0
    : settings.anthropicApiKey.trim().length > 0;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {!ready && (
        <Card title={usingLocal ? 'Pick a local model first' : 'Needs your Anthropic API key'}>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {usingLocal
              ? 'Describe a meal in words and get macros back, estimated by a model running on your own machine — no key, no cost, nothing leaves the device. Choose which model in Settings.'
              : 'This describes a meal to Claude and gets macros back, billed to your own API key at roughly one to four cents a meal. Add a key in Settings, or switch to a local model there instead.'}
          </Text>
          <View style={{ height: space.md }} />
          <Button label="Open Settings" onPress={() => router.replace('/settings')} />
        </Card>
      )}

      <Card title="What did you eat?" subtitle="Write it how you would say it out loud.">
        <Field
          label="Description"
          value={text}
          onChangeText={setText}
          multiline
          placeholder="two scrambled eggs in butter, sourdough toast, flat white"
          hint="On a phone, the keyboard's microphone is far quicker than typing this."
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
        <Button
          label={busy ? `Estimating… ${elapsed}s` : 'Estimate macros'}
          disabled={busy || !text.trim() || !ready}
          onPress={() => void run()}
        />
      </Card>

      {busy && !estimate && (
        <Card>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.md }]}>
            {usingLocal
              ? `Running ${settings.ollamaModel} on this machine — a large local model usually takes 10 to 45 seconds.`
              : 'Asking Claude…'}
          </Text>
        </Card>
      )}

      {error && (
        <Card title="That did not work">
          <Text style={[styles.body, { color: colors.danger }]}>{error}</Text>
        </Card>
      )}

      {estimate?.notFood && (
        <Card title="That does not look like food">
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Claude could not read that as something you ate. Try describing the food and roughly how much.
          </Text>
        </Card>
      )}

      {estimate && !estimate.notFood && (
        <>
          {estimate.notes.trim().length > 0 && (
            <Card title="What Claude had to assume">
              <Text style={[styles.body, { color: colors.textMuted }]}>{estimate.notes}</Text>
            </Card>
          )}

          <Card
            title="Estimated items"
            subtitle="Adjust any portion — the macros move with it. Tap a row to leave it out."
          >
            {drafts.map((draft, index) => {
              const scaled = scaleItem(draft.item, draft.grams);
              const adjusted = Math.abs(draft.grams - draft.item.grams) > 0.5;

              return (
                <View key={`${draft.item.name}-${index}`} style={styles.item}>
                  <Pressable
                    onPress={() =>
                      setDrafts((current) =>
                        current.map((d, i) => (i === index ? { ...d, included: !d.included } : d)),
                      )
                    }
                    style={styles.itemHeader}
                  >
                    <Text
                      style={[
                        styles.itemName,
                        {
                          color: draft.included ? colors.text : colors.textFaint,
                          textDecorationLine: draft.included ? 'none' : 'line-through',
                        },
                      ]}
                    >
                      {draft.item.name}
                    </Text>
                    <View
                      style={[styles.badge, { borderColor: confidenceColor(draft.item.confidence) }]}
                    >
                      <Text style={{ fontSize: 10, color: confidenceColor(draft.item.confidence) }}>
                        {draft.item.confidence}
                      </Text>
                    </View>
                  </Pressable>

                  {draft.item.assumption.trim().length > 0 && (
                    <Text style={[styles.assumption, { color: colors.textFaint }]}>
                      {draft.item.assumption}
                    </Text>
                  )}

                  {draft.included && (
                    <>
                      <Field
                        label="Portion"
                        value={String(roundTo(draft.grams, 1))}
                        onChangeText={(value) => {
                          const parsed = Number.parseFloat(value.replace(',', '.'));
                          setDrafts((current) =>
                            current.map((d, i) =>
                              i === index
                                ? { ...d, grams: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 }
                                : d,
                            ),
                          );
                        }}
                        keyboardType="decimal-pad"
                        suffix="g"
                      />
                      <Text style={[styles.macros, { color: colors.textMuted }]}>
                        {Math.round(scaled.kcal)} kcal · P {scaled.proteinG.toFixed(1)} · C{' '}
                        {scaled.carbsG.toFixed(1)} · F {scaled.fatG.toFixed(1)}
                        {adjusted && (
                          <Text style={{ color: colors.textFaint }}>
                            {'  '}· scaled from {Math.round(draft.item.grams)} g
                          </Text>
                        )}
                      </Text>
                    </>
                  )}
                </View>
              );
            })}
          </Card>

          <Card title={`Total for ${MEAL_LABELS[meal]}`}>
            <Text style={[styles.total, { color: colors.text }]}>
              {Math.round(totals.kcal)} kcal
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              P {Math.round(totals.proteinG)} g · C {Math.round(totals.carbsG)} g · F{' '}
              {Math.round(totals.fatG)} g
            </Text>
            {costUsd !== null ? (
              <Text style={[styles.cost, { color: colors.textFaint }]}>
                Estimated by {ranOn} — about ${costUsd.toFixed(4)} of API usage.
              </Text>
            ) : (
              ranOn && (
                <Text style={[styles.cost, { color: colors.textFaint }]}>
                  Estimated by {ranOn}, on this machine. No cost.
                </Text>
              )
            )}
            <View style={{ height: space.md }} />
            <Button
              label="Add to diary"
              disabled={busy || totals.kcal <= 0}
              onPress={() => void logAll()}
            />
          </Card>
        </>
      )}

      <Button label="Cancel" variant="subtle" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  body: { fontSize: 13, lineHeight: 19 },
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
  item: { marginBottom: space.lg },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  itemName: { flex: 1, fontSize: 15, fontWeight: '600' },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  assumption: { fontSize: 12, marginTop: 2, marginBottom: space.sm, lineHeight: 16 },
  macros: { fontSize: 12, fontVariant: ['tabular-nums'] },
  total: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  cost: { fontSize: 11, marginTop: space.sm },
});
