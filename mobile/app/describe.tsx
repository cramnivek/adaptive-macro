import type { Food, Meal, Nutrients } from '@adaptive-macros/engine';
import { roundTo } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  type EstimatedItem,
  type MealEstimate,
  type MealPhoto,
  describeErrorMessage,
  estimateMeal,
} from '../src/ai/describeMeal';
import { scanPhaseOf } from '../src/ai/foodScan';
import { captureWithSystemCamera, chooseMealPhoto, preparePhoto } from '../src/ai/mealPhoto';
import { FoodScanOverlay } from '../src/components/FoodScanOverlay';
import { MealCameraSheet } from '../src/components/MealCameraSheet';
import { Card } from '../src/components/Card';
import { Button, Field, TOUCH_TARGET } from '../src/components/Controls';
import { addLogEntry, saveFood } from '../src/db';
import { MEAL_LABELS } from '../src/format';
import { useApp } from '../src/state/AppStore';
import { font, radius, space, useTheme } from '../src/theme';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DRAFT_TEXT_KEY = 'ascend.describeDraftText';

const readDraftText = (): string => {
  try {
    return typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(DRAFT_TEXT_KEY) ?? '') : '';
  } catch {
    return '';
  }
};

const writeDraftText = (value: string): void => {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (value) sessionStorage.setItem(DRAFT_TEXT_KEY, value);
    else sessionStorage.removeItem(DRAFT_TEXT_KEY);
  } catch {
    // Storage unavailable (native or private mode).
  }
};

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
  const params = useLocalSearchParams<{ meal?: string; capture?: string; text?: string }>();

  const { settings, selectedDate, refreshAll } = useApp();
  const [meal, setMeal] = useState<Meal>((params.meal as Meal) ?? 'snack');
  // Prefilled when arriving from a search that the databases could not answer,
  // or restored from sessionStorage if staleBuild reloaded the page mid-entry.
  const [text, setText] = useState(() => params.text ?? readDraftText());
  const [photo, setPhoto] = useState<MealPhoto | null>(null);
  const [camera, setCamera] = useState(false);
  /**
   * Whether the sheet can show a live camera, or only a shot already taken.
   *
   * On web it cannot: expo-camera asks getUserMedia for no resolution, so the
   * preview is a low-res crop. The phone's camera app takes the picture
   * instead, which also means there is nothing to show until it returns — open
   * the sheet first and it is a black screen with a button on it.
   */
  const livePreview = Platform.OS !== 'web';

  /** Opens whichever camera this runtime has. */
  const openCamera = () => (livePreview ? setCamera(true) : void systemCapture());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    writeDraftText(text);
  }, [text]);

  const closeDescribe = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    writeDraftText('');
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // A local 32B model takes 10-45 seconds. Without a visible clock that reads
  // as a hang, and the user taps again or gives up on the feature.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [busy]);

  /**
   * A cancelled picker is not an error, so `null` leaves the screen as it was.
   * A refused camera permission is one, and says so without blocking the text
   * path, which still works.
   */
  const pick = async (source: () => Promise<MealPhoto | null>) => {
    setError(null);
    try {
      const chosen = await source();
      if (chosen) setPhoto(chosen);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (params.capture === 'camera') openCamera();
    // Mount only. Re-running when the param object's identity changes would
    // reopen the camera behind the user on every re-render of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * A shot taken inside the camera sheet: keep it, then estimate it straight
   * away. The sheet stays open over the result, so a bad frame costs a retake
   * rather than the whole walk back through this screen.
   */
  const captureFromCamera = async (uri: string) => {
    setError(null);
    setEstimate(null);
    setDrafts([]);
    try {
      const shot = await preparePhoto(uri);
      setPhoto(shot);
      await run(shot);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /**
   * Web: the phone's camera app takes the shot, then the sheet shows it with
   * the estimate over it, the same as a shot taken in the preview.
   */
  const systemCapture = async () => {
    setError(null);
    setEstimate(null);
    setDrafts([]);
    try {
      const shot = await captureWithSystemCamera();
      // Cancelled at the camera app, which is not an error and not a reason to
      // open an empty sheet.
      if (!shot) return;
      setPhoto(shot);
      setCamera(true);
      await run(shot);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** Back to the live camera, with nothing from the discarded frame left over. */
  const retake = () => {
    setPhoto(null);
    setEstimate(null);
    setDrafts([]);
    setError(null);
    // Web has no live view to return to, so "shoot again" means the camera app
    // again rather than an empty sheet.
    if (!livePreview) {
      setCamera(false);
      void systemCapture();
    }
  };

  const run = async (withPhoto?: MealPhoto) => {
    // Taken as an argument because the camera sheet estimates in the same tick
    // it sets the photo, and the state update has not committed by then.
    const image = withPhoto ?? photo ?? undefined;
    if (!text.trim() && !image) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setEstimate(null);
    setDrafts([]);

    try {
      const result = await estimateMeal(
        text,
        {
          provider: settings.aiProvider,
          geminiApiKey: settings.foodLookup.geminiApiKey,
          anthropicApiKey: settings.anthropicApiKey,
          ollamaHost: settings.ollamaHost,
          ollamaModel: settings.ollamaModel,
        },
        image,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setEstimate(result.estimate);
      setDrafts(
        result.estimate.items.map((item) => ({ item, grams: item.grams, included: true })),
      );
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(describeErrorMessage(caught));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
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
      closeDescribe();
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
  const ready =
    settings.aiProvider === 'gemini'
      ? true
      : usingLocal
        ? settings.ollamaModel.trim().length > 0
        : settings.anthropicApiKey.trim().length > 0;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {!ready && (
        <Card title={usingLocal ? 'Pick a local model first' : 'API key needed'}>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {usingLocal
              ? 'Describe a meal in words or photo to log macros, computed locally on your machine. Choose which model in Settings.'
              : 'Describe what you ate or drank to estimate calories and macros. Add an API key in Settings, or switch to a local model there instead.'}
          </Text>
          <View style={{ height: space.md }} />
          <Button label="Open Settings" onPress={() => router.replace('/settings')} />
        </Card>
      )}

      <MealCameraSheet
        visible={camera}
        photo={photo}
        estimate={estimate}
        error={error}
        busy={busy}
        elapsed={elapsed}
        onCapture={(uri) => void captureFromCamera(uri)}
        onSystemCapture={() => void systemCapture()}
        onRetake={retake}
        onClose={() => {
          abortRef.current?.abort();
          abortRef.current = null;
          setBusy(false);
          setCamera(false);
        }}
      />

      <Card title="What did you eat?" subtitle="Photograph it, write it, or both.">
        {photo ? (
          <View style={styles.photoRow}>
            <View style={[styles.photoPreview, { borderColor: colors.border, overflow: 'hidden' }]}>
              <Image
                source={{ uri: `data:${photo.mimeType};base64,${photo.base64}` }}
                style={StyleSheet.absoluteFill}
              />
              {busy && <FoodScanOverlay compact elapsed={elapsed} />}
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Remove photo"
                variant="subtle"
                onPress={() => {
                  setPhoto(null);
                  setEstimate(null);
                  setDrafts([]);
                }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.photoRow}>
            <View style={{ flex: 1 }}>
              <Button label="Take a photo" variant="subtle" onPress={openCamera} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Choose a photo" variant="subtle" onPress={() => void pick(chooseMealPhoto)} />
            </View>
          </View>
        )}
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
              <Text style={{ fontFamily: font.uiStrong, color: option === meal ? colors.onFill : colors.text, fontSize: 13 }}>
                {MEAL_LABELS[option]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button
          label={busy ? `Estimating… ${elapsed}s` : 'Estimate macros'}
          disabled={busy || (!text.trim() && !photo) || !ready}
          onPress={() => void run()}
        />
      </Card>

      {busy && !estimate && (
        <Card>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.md }]}>
            {photo
              ? `${scanPhaseOf(elapsed).label} (${elapsed}s)`
              : usingLocal
                ? `Running ${settings.ollamaModel} on this machine — a large local model usually takes 10 to 45 seconds.`
                : 'Estimating macros…'}
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
            Could not identify food items. Try describing what you ate and roughly how much.
          </Text>
        </Card>
      )}

      {estimate && !estimate.notFood && (
        <>
          {estimate.notes.trim().length > 0 && (
            <Card title="What the estimate assumed">
              <Text style={[styles.body, { color: colors.textMuted }]}>{estimate.notes}</Text>
            </Card>
          )}

          <Card
            title="Estimated items"
            subtitle="Adjust any portion — the macros move with it. Tap ✕ Remove to delete an item."
          >
            <View style={styles.cardActionRow}>
              <Pressable
                onPress={() => {
                  setEstimate(null);
                  setDrafts([]);
                }}
                hitSlop={8}
                style={[styles.resetEstimateBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.resetEstimateText, { color: colors.textMuted }]}>
                  ✕ Discard estimate / Reset
                </Text>
              </Pressable>
            </View>

            {drafts.length === 0 && (
              <Text style={[styles.body, { color: colors.textMuted, marginVertical: space.sm }]}>
                No items in estimate. Tap 'Discard estimate / Reset' to start over or describe a meal above.
              </Text>
            )}

            {drafts.map((draft, index) => {
              const scaled = scaleItem(draft.item, draft.grams);
              const adjusted = Math.abs(draft.grams - draft.item.grams) > 0.5;

              return (
                <View key={`${draft.item.name}-${index}`} style={styles.item}>
                  <View style={styles.itemHeader}>
                    <Pressable
                      onPress={() =>
                        setDrafts((current) =>
                          current.map((d, i) => (i === index ? { ...d, included: !d.included } : d)),
                        )
                      }
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
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
                        <Text style={{ fontFamily: font.ui, fontSize: 10, color: confidenceColor(draft.item.confidence) }}>
                          {draft.item.confidence}
                        </Text>
                      </View>
                    </Pressable>

                    <View style={styles.itemActionGroup}>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/search',
                            params: { q: draft.item.name, meal },
                          })
                        }
                        hitSlop={8}
                        style={[styles.matchItemBtn, { borderColor: colors.border }]}
                        accessibilityLabel={`Look up ${draft.item.name} in food database`}
                      >
                        <Text style={[styles.matchItemBtnText, { color: colors.accent }]}>🔍 Match</Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          setDrafts((current) => current.filter((_, i) => i !== index))
                        }
                        hitSlop={10}
                        style={[styles.removeItemBtn, { borderColor: colors.border }]}
                        accessibilityLabel={`Remove ${draft.item.name}`}
                      >
                        <Text style={[styles.removeItemBtnText, { color: colors.danger }]}>✕ Remove</Text>
                      </Pressable>
                    </View>
                  </View>

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
                          <Text style={{ fontFamily: font.ui, color: colors.textFaint }}>
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
            <View style={{ height: space.md }} />
            <Button
              label="Add to diary"
              disabled={busy || totals.kcal <= 0}
              onPress={() => void logAll()}
            />
          </Card>
        </>
      )}

      <Button label="Cancel" variant="subtle" onPress={closeDescribe} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  photoPreview: { width: 72, height: 72, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  content: { padding: space.lg, paddingBottom: space.xxl },
  body: { fontFamily: font.ui, fontSize: 13, lineHeight: 19 },
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
  itemName: { fontFamily: font.uiStrong, flex: 1, fontSize: 15 },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  assumption: { fontFamily: font.ui, fontSize: 12, marginTop: 2, marginBottom: space.sm, lineHeight: 16 },
  macros: { fontFamily: font.figure, fontSize: 12, fontVariant: ['tabular-nums'] },
  total: {
    fontFamily: font.figure,
    fontVariant: ['tabular-nums'],
    fontSize: 26,
    letterSpacing: -0.5,
  },
  cost: { fontFamily: font.ui, fontSize: 11, marginTop: space.sm },
  cardActionRow: { marginBottom: space.sm, alignItems: 'flex-end' },
  resetEstimateBtn: {
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resetEstimateText: { fontFamily: font.ui, fontSize: 12 },
  removeItemBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  removeItemBtnText: { fontFamily: font.uiStrong, fontSize: 11 },
  itemActionGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchItemBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  matchItemBtnText: { fontFamily: font.uiStrong, fontSize: 11 },
});
