import type { LogEntry, Meal } from '@adaptive-macros/engine';
import { addDays } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { BrandLockup } from '../../src/components/BrandLockup';
import { BrandGlyph } from '../../src/components/BrandGlyph';
import { CheckInCard } from '../../src/components/CheckInCard';
import { CheckInReadyCard } from '../../src/components/CheckInReadyCard';
import { FadeIn } from '../../src/components/FadeIn';
import { Tappable } from '../../src/components/Tappable';
import { HomeScreenNotice } from '../../src/components/HomeScreenNotice';
import { FirstWeekCalibrationCard } from '../../src/components/FirstWeekCalibrationCard';
import { TOUCH_TARGET } from '../../src/components/Controls';
import { EditEntrySheet } from '../../src/components/EditEntrySheet';
import { MacroSummary } from '../../src/components/MacroProgress';
import { NutritionQualityCard } from '../../src/components/NutritionQualityCard';
import { Screen } from '../../src/components/Screen';
import { shouldAskAbout } from '../../src/dayStatus';
import { getDailySteps, lastMealsBefore, type DailyStepRecord, type RecentMeal } from '../../src/db';
import { onHealthConnectSynced } from '../../src/health/healthConnect';
import { sameAsLabel } from '../../src/mealRepeat';
import { confirm } from '../../src/dialog';
import { MEAL_LABELS, formatDateLong } from '../../src/format';
import { useApp } from '../../src/state/AppStore';
import { font, radius, space, useTheme } from '../../src/theme';
import { TransparentStickerModal } from '../../src/components/TransparentStickerModal';
import { StepLogModal } from '../../src/components/StepLogModal';
import { SleepSummaryCard } from '../../src/components/SleepSummaryCard';

const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function TodayScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    localDay,
    selectedDate,
    setSelectedDate,
    entries,
    totals,
    program,
    removeEntry,
    editEntry,
    ready,
    observations,
    dayStatus,
    markDay,
    settings,
  } = useApp();

  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [recentMeals, setRecentMeals] = useState<Map<Meal, RecentMeal>>(new Map());
  const [foodDetailsOpen, setFoodDetailsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [dailySteps, setDailySteps] = useState<DailyStepRecord | null>(null);
  const [stepModalOpen, setStepModalOpen] = useState(false);

  const loadSteps = useCallback(async () => {
    try {
      const record = await getDailySteps(selectedDate);
      setDailySteps(record);
    } catch {
      setDailySteps(null);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadSteps();
  }, [loadSteps]);

  // A tab stays mounted, so steps that arrived while it was out of view
  // waited for the date to change. Read again on returning to it, and the
  // moment a Health Connect sync lands.
  useFocusEffect(
    useCallback(() => {
      void loadSteps();
    }, [loadSteps]),
  );
  useEffect(() => onHealthConnectSynced(() => void loadSteps()), [loadSteps]);

  const renderMealActions = (meal: Meal, kcal?: number) => (
    <View style={styles.mealActions}>
      {kcal !== undefined && <Text style={[styles.entryMeta, { color: colors.textMuted }]}>{Math.round(kcal)} kcal</Text>}
      <Tappable
        onPress={() => router.push({ pathname: '/log-meal', params: { meal } })}
        scaleTo={0.97}
        style={[styles.logMealButton, { backgroundColor: colors.surface }]}
        accessibilityLabel={`Log a meal for ${MEAL_LABELS[meal]}`}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={18} color={colors.text} />
        <Text style={[styles.logMealLabel, { color: colors.text }]}>Add</Text>
      </Tappable>
    </View>
  );

  useEffect(() => {
    let live = true;
    setRecentMeals(new Map());
    void lastMealsBefore(selectedDate).then((found) => {
      if (live) setRecentMeals(found);
    }).catch(() => { if (live) setRecentMeals(new Map()); });
    return () => {
      live = false;
    };
  }, [selectedDate, entries]);

  const byMeal = useMemo(() => {
    const groups = new Map<Meal, LogEntry[]>(MEAL_ORDER.map((meal) => [meal, []]));
    for (const entry of entries) groups.get(entry.meal)?.push(entry);
    return groups;
  }, [entries]);

  const confirmDelete = async (entry: LogEntry) => {
    const ok = await confirm({
      title: 'Remove entry',
      message: `Remove ${entry.foodName} from ${MEAL_LABELS[entry.meal]}?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) await removeEntry(entry.id);
  };

  const isToday = selectedDate === localDay;

  // Asked on today's screen about yesterday, because that is where people are:
  // almost nobody goes back through past days to tidy them.
  const yesterday = addDays(localDay, -1);
  const yesterdayKcal = observations.find((o) => o.date === yesterday)?.intakeKcal;
  const askAboutYesterday =
    ready && isToday && shouldAskAbout(yesterdayKcal, dayStatus.get(yesterday), program.calories.kcal);
  const leftOut = dayStatus.get(selectedDate) === false;

  const activityCards = (
    <>
      {/* Micronutrients from what was logged today, against the reference intakes. */}
      <NutritionQualityCard
        consumed={totals}
        entries={entries}
        profile={settings.profile}
      />
  
      {/* Daily Steps & NEAT Activity Card */}
      <Pressable
        onPress={() => setStepModalOpen(true)}
        style={({ pressed }) => [
          styles.stepsCard,
          {
            backgroundColor: colors.features.activity.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Daily steps and activity"
      >
        <View style={styles.stepsCardLeft}>
          <View style={[styles.stepsIconBubble, { backgroundColor: colors.features.activity.note, borderColor: colors.border }]}>
            <BrandGlyph kind="steps" size={22} color={colors.features.activity.accent} accent={colors.brand.text} />
          </View>
          <View style={{ gap: 2, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.stepsCardTitle, { color: colors.text }]}>
                {dailySteps
                  ? `${dailySteps.steps.toLocaleString()} steps`
                  : settings.personality === 'gymrat'
                    ? 'Daily Steps & Cardio'
                    : 'Daily steps'}
              </Text>
              {dailySteps && dailySteps.activeKcal ? (
                <View style={[styles.stepsTag, { backgroundColor: colors.accent + '20' }]}>
                  <Text style={[styles.stepsTagText, { color: colors.accent }]}>
                    +{Math.round(dailySteps.activeKcal)} KCAL{settings.personality === 'gymrat' ? ' 🔥' : ''}
                  </Text>
                </View>
              ) : (
                <View style={[styles.stepsTag, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.stepsTagText, { color: colors.textMuted }]}>
                    Not logged
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.stepsCardSubtitle, { color: colors.textMuted }]}>
              {dailySteps
                ? `${Math.min(100, Math.round((dailySteps.steps / 10000) * 100))}% of 10k goal · ${dailySteps.distanceKm ?? 0} km walked · Tap to edit`
                : settings.personality === 'gymrat'
                  ? 'Hit your 10k daily step goal to keep expenditure dialed in 🔥'
                  : "Tap to log today's steps"}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </>
  );

  return (
    <Screen
      title="Today"
      action={
        <View style={styles.headerActions}>
          <BrandLockup markColor={colors.brand.text} textColor={colors.text} size={16} style={{ flexShrink: 1 }} />
          <Tappable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" style={styles.gear}>
            <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
          </Tappable>
        </View>
      }
    >
      <HomeScreenNotice />
      <View style={styles.dateNav}>
        <Pressable
          onPress={() => setSelectedDate(addDays(selectedDate, -1))}
          accessibilityRole="button"
          accessibilityLabel="Go to the previous day"
          style={[styles.navButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => setSelectedDate(localDay)}
          accessibilityRole="button"
          accessibilityLabel={isToday ? formatDateLong(selectedDate) : `${formatDateLong(selectedDate)}. Jump to today`}
          style={[styles.navButton, styles.navToday, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: isToday ? colors.textFaint : colors.accent, fontFamily: font.uiStrong }}>
            {formatDateLong(selectedDate)}{isToday && ' · Today'}
          </Text>
          {!isToday && <Text style={{ color: colors.accent, fontFamily: font.ui, fontSize: 11 }}>Go to today</Text>}
        </Pressable>
        <Pressable
          onPress={() => setSelectedDate(addDays(selectedDate, 1))}
          // Logging into the future would feed the estimator days that have not
          // happened yet, so forward navigation stops at today.
          disabled={isToday}
          accessibilityRole="button"
          accessibilityLabel="Go to the next day"
          style={[
            styles.navButton,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: isToday ? 0.35 : 1 },
          ]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      <Card variant="featured" style={styles.foodSummary}>
        <MacroSummary compact consumed={totals} target={program.macros} />
        <Pressable
          onPress={() => setFoodDetailsOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: foodDetailsOpen }}
          style={styles.disclosure}
        >
          <Text style={[styles.disclosureLabel, { color: leftOut ? colors.warning : colors.textMuted }]}>
            {leftOut ? 'Day excluded · Food details' : 'Food details & sharing'}
          </Text>
          <Ionicons name={foodDetailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </Pressable>
        {foodDetailsOpen && <>
        <View style={styles.macroCardFooter}>
          <Text style={[styles.targetLine, { color: colors.textMuted }]}>
            Target {program.calories.kcal} kcal
            {program.calories.adjustmentKcal !== 0 &&
              ` · ${program.calories.adjustmentKcal > 0 ? '+' : ''}${program.calories.adjustmentKcal} vs expenditure`}
          </Text>
          <Pressable
            onPress={() => setShowStickerModal(true)}
            style={({ pressed }) => [
              styles.stickerPill,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Export nutrition sticker for stories"
          >
            <Ionicons name="share-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.stickerPillText, { color: colors.text }]}>
              Share today as a sticker
            </Text>
          </Pressable>
        </View>
        {/*
          A day missing a meal reads to the estimator as a deficit the scale
          never showed, and the target drops to explain it. This takes the day
          out of the estimate without touching the diary.
        */}
        {entries.length > 0 && (
          <Pressable
            onPress={() => void markDay(selectedDate, leftOut ? null : false)}
            accessibilityRole="button"
            style={styles.completeness}
          >
            <Text style={[styles.completenessText, { color: leftOut ? colors.warning : colors.textFaint }]}>
              {leftOut
                ? 'Not fully logged · left out of your expenditure estimate. Tap to count it again.'
                : 'Not everything logged? Tap to leave this day out of the estimate.'}
            </Text>
          </Pressable>
        )}
        </>}
      </Card>
      <View style={styles.dayActions}>
        <Tappable
          onPress={() => router.push('/log-meal')}
          accessibilityRole="button"
          style={[styles.dayAction, { backgroundColor: colors.brand.fill }]}
        >
          <BrandGlyph kind="meal" size={22} color={colors.brand.onFill} />
          <Text style={[styles.dayActionLabel, { color: colors.brand.onFill }]}>Log a meal</Text>
        </Tappable>
        <Pressable
          onPress={() => router.push({ pathname: '/quick-add', params: { meal: 'snack' } })}
          accessibilityRole="button"
          style={[styles.dayAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="flash-outline" size={16} color={colors.text} />
          <Text style={[styles.dayActionLabel, { color: colors.text }]}>Quick add</Text>
        </Pressable>
      </View>
      <View style={styles.diaryHeading}>
        <Text style={[styles.diaryTitle, { color: colors.text }]}>Your meals</Text>
        <Pressable
          onPress={() => router.push('/repeat')}
          accessibilityRole="button"
          style={styles.repeatLink}
        >
          <Ionicons name="repeat-outline" size={16} color={colors.text} />
          <Text style={[styles.repeatLabel, { color: colors.textMuted }]}>Choose previous foods</Text>
        </Pressable>
      </View>

      {MEAL_ORDER.map((meal) => {
        const mealEntries = byMeal.get(meal) ?? [];
        const mealKcal = mealEntries.reduce((sum, entry) => sum + entry.nutrients.kcal, 0);

        return (
          <Card
            key={meal}
            title={MEAL_LABELS[meal]}
            right={renderMealActions(meal, mealEntries.length ? mealKcal : undefined)}
            style={styles.mealSection}
          >
            {/*
              Each entry arrives rather than appearing. The stagger is small and
              capped: a logged food should slide in, but a meal with eight items
              must not take most of a second to finish drawing itself.
            */}
            {mealEntries.map((entry, entryIndex) => (
              <FadeIn key={entry.id} delay={Math.min(entryIndex, 5) * 30}>
                <Tappable
                  onPress={() => setEditing(entry)}
                  onLongPress={() => void confirmDelete(entry)}
                  scaleTo={0.985}
                  style={styles.entry}
                >
                  <View style={styles.entryText}>
                    <Text style={[styles.entryName, { color: colors.text }]} numberOfLines={2}>
                      {entry.foodName}
                    </Text>
                    <Text style={[styles.entryMeta, { color: colors.textFaint }]}>
                      {Math.round(entry.grams)} g · P {Math.round(entry.nutrients.proteinG)} ·
                      {' '}C {Math.round(entry.nutrients.carbsG)} · F {Math.round(entry.nutrients.fatG)}
                    </Text>
                  </View>
                  <Text style={[styles.entryKcal, { color: colors.textMuted }]}>
                    {Math.round(entry.nutrients.kcal)}
                  </Text>
                </Tappable>
              </FadeIn>
            ))}
            {/*
              Most people eat the same breakfast most days. An empty meal offers
              the last one logged this week as a selection, so tapping it never
              logs a whole meal without reviewing the foods.
            */}
            {mealEntries.length === 0 && recentMeals.has(meal) && (() => {
              const recent = recentMeals.get(meal)!;
              const label = sameAsLabel(recent.date, selectedDate);
              return (
                <Tappable
                  onPress={() => router.push({ pathname: '/repeat', params: { from: recent.date, meal } })}
                  scaleTo={0.97}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose foods ${label.toLowerCase()} for ${MEAL_LABELS[meal]}`}
                  style={[styles.repeatChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                >
                  <Ionicons name="repeat-outline" size={15} color={colors.accent} />
                  <Text style={[styles.repeatLabel, { color: colors.text }]}>{label.replace('Same as', 'Choose from')}</Text>
                  <Text style={[styles.repeatMeta, { color: colors.textFaint }]}>
                    {recent.items === 1 ? '1 item' : `${recent.items} items`} · {Math.round(recent.kcal)} kcal
                  </Text>
                </Tappable>
              );
            })()}
          </Card>
        );
      })}

      {entries.length > 0 && <Text style={[styles.deleteHint, { color: colors.textFaint }]}>Tap a food to edit · Hold to remove</Text>}
      <Pressable
        onPress={() => setMoreOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOpen }}
        style={[styles.moreButton, { borderColor: colors.border }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.disclosureLabel, { color: colors.text }]}>More for today</Text>
          <Text style={[styles.entryMeta, { color: colors.textMuted }]}>Sleep, activity & check-ins</Text>
        </View>
        <Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {moreOpen && <>
        <FirstWeekCalibrationCard />
        {activityCards}
        {isToday && <CheckInCard />}
        {isToday && <CheckInReadyCard />}
        {askAboutYesterday && yesterdayKcal !== undefined && (
          <View style={[styles.banner, styles.question, { backgroundColor: colors.surfaceRaised, borderColor: colors.warning }]}>
            <Text style={[styles.questionTitle, { color: colors.text }]}>Yesterday's log came to {Math.round(yesterdayKcal)} kcal. Was that everything?</Text>
            <Text style={[styles.bannerText, { color: colors.textMuted }]}>If a meal is missing, leaving the day out stops it from lowering your target.</Text>
            <View style={styles.questionActions}>
              <Pressable onPress={() => void markDay(yesterday, true)} accessibilityRole="button" style={[styles.dayAction, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.dayActionLabel, { color: colors.text }]}>Logged everything</Text>
              </Pressable>
              <Pressable onPress={() => void markDay(yesterday, false)} accessibilityRole="button" style={[styles.dayAction, { backgroundColor: colors.surface, borderColor: colors.warning }]}>
                <Text style={[styles.dayActionLabel, { color: colors.text }]}>Exclude from estimate</Text>
              </Pressable>
            </View>
          </View>
        )}
        <SleepSummaryCard />
      </>}
      <EditEntrySheet
        entry={editing}
        onCancel={() => setEditing(null)}
        onSave={(entry, grams, meal) => {
          setEditing(null);
          void editEntry(entry, grams, meal);
        }}
        onDelete={(entry) => {
          setEditing(null);
          void removeEntry(entry.id);
        }}
      />
      <TransparentStickerModal
        visible={showStickerModal}
        onClose={() => setShowStickerModal(false)}
        mode="nutrition"
        nutritionData={{
          consumed: totals,
          profile: settings.profile,
        }}
      />
      <StepLogModal
        visible={stepModalOpen}
        onClose={() => setStepModalOpen(false)}
        date={selectedDate}
        initialSteps={dailySteps?.steps ?? 0}
        userWeightKg={settings.goalWeightKg ?? 75}
        onSaved={() => {
          void loadSteps();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1, minWidth: 0, marginLeft: space.sm },
  stepsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.md,
  },
  stepsCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flex: 1,
  },
  stepsIconBubble: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsCardTitle: {
    fontFamily: font.uiStrong,
    fontSize: 14,
  },
  stepsTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  stepsTagText: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    letterSpacing: 1,
  },
  stepsCardSubtitle: {
    fontFamily: font.ui,
    fontSize: 11,
  },
  gear: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  dateNav: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  navButton: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navToday: { flex: 1 },
  foodSummary: { paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md },
  disclosure: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: space.xs },
  disclosureLabel: { fontFamily: font.uiStrong, fontSize: 12, flexShrink: 1 },
  diaryHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: space.sm },
  diaryTitle: { fontFamily: font.uiStrong, fontSize: 18 },
  repeatLink: { minHeight: TOUCH_TARGET, flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  mealSection: { marginBottom: space.md },
  moreButton: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.md, marginBottom: space.md },
  targetLine: { fontFamily: font.ui, fontSize: 12, textAlign: 'center' },
  macroCardFooter: {
    marginTop: space.sm,
    gap: space.xs,
    alignItems: 'center',
  },
  stickerPill: {
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  stickerPillText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
  },
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    marginBottom: space.md,
  },
  bannerText: { fontFamily: font.ui, flex: 1, fontSize: 12, lineHeight: 17 },
  question: { flexDirection: 'column', alignItems: 'stretch' },
  questionTitle: { fontFamily: font.uiStrong, fontSize: 14, lineHeight: 19 },
  questionActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  completeness: { minHeight: TOUCH_TARGET, justifyContent: 'center', marginTop: space.xs },
  completenessText: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  mealActions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  logMealButton: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    gap: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logMealLabel: { fontFamily: font.uiStrong, fontSize: 13 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    paddingVertical: space.sm,
    gap: space.md,
  },
  entryText: { flex: 1 },
  entryName: { fontFamily: font.uiStrong, fontSize: 15 },
  entryMeta: { fontFamily: font.ui, fontSize: 11, marginTop: 1 },
  entryKcal: { fontFamily: font.figure, fontSize: 15, fontVariant: ['tabular-nums'] },
  repeatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  repeatLabel: { fontFamily: font.uiStrong, fontSize: 13 },
  repeatMeta: { fontFamily: font.ui, fontSize: 12, marginLeft: 'auto' },
  deleteHint: { fontFamily: font.ui, fontSize: 11, marginTop: space.xs, textAlign: 'center' },
  dayActions: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  dayAction: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dayActionLabel: { fontFamily: font.uiStrong, fontSize: 13 },
});
