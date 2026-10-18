import type { ISODate, LogEntry, Meal } from '@adaptive-macros/engine';
import { addDays, todayISO } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Card } from '../../src/components/Card';
import { CheckInCard } from '../../src/components/CheckInCard';
import { FadeIn } from '../../src/components/FadeIn';
import { Tappable } from '../../src/components/Tappable';
import { HomeScreenNotice } from '../../src/components/HomeScreenNotice';
import { ActiveWorkoutBanner } from '../../src/components/ActiveWorkoutBanner';
import { FirstWeekCalibrationCard } from '../../src/components/FirstWeekCalibrationCard';
import { TOUCH_TARGET } from '../../src/components/Controls';
import { EditEntrySheet } from '../../src/components/EditEntrySheet';
import { MacroSummary } from '../../src/components/MacroProgress';
import { NutritionQualityCard } from '../../src/components/NutritionQualityCard';
import { Screen } from '../../src/components/Screen';
import { shouldAskAbout } from '../../src/dayStatus';
import { lastMealsBefore, type RecentMeal } from '../../src/db';
import { sameAsLabel } from '../../src/mealRepeat';
import { confirm } from '../../src/dialog';
import { MEAL_LABELS, formatDateLong } from '../../src/format';
import { useApp } from '../../src/state/AppStore';
import { font, radius, space, useTheme } from '../../src/theme';
import { MissionBanner } from '../../src/components/MissionBanner';
import { TransparentStickerModal } from '../../src/components/TransparentStickerModal';

const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function TodayScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
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
    copyDay,
    settings,
  } = useApp();

  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [recentMeals, setRecentMeals] = useState<Map<Meal, RecentMeal>>(new Map());
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  // The meal being copied, so a second tap before the diary reloads cannot
  // copy it twice.
  const [repeating, setRepeating] = useState<Meal | null>(null);
  const [showStickerModal, setShowStickerModal] = useState(false);

  const renderMealActions = (meal: Meal, style?: ViewStyle) => (
    <View style={[styles.mealActions, style]}>
      <Tappable
        onPress={() =>
          router.push({ pathname: '/describe', params: { meal, capture: 'camera' } })
        }
        scaleTo={0.9}
        style={[styles.iconButton, { backgroundColor: colors.surfaceRaised }]}
        accessibilityLabel={`Photograph something to add to ${MEAL_LABELS[meal]}`}
      >
        <Ionicons name="camera-outline" size={18} color={colors.text} />
      </Tappable>
      <Tappable
        onPress={() => router.push({ pathname: '/describe', params: { meal } })}
        scaleTo={0.9}
        style={[styles.iconButton, { backgroundColor: colors.surfaceRaised }]}
        accessibilityLabel={`Describe something to add to ${MEAL_LABELS[meal]}`}
      >
        <Ionicons name="sparkles-outline" size={18} color={colors.text} />
      </Tappable>
      <Tappable
        onPress={() => router.push({ pathname: '/scan', params: { meal } })}
        scaleTo={0.9}
        style={[styles.iconButton, { backgroundColor: colors.surfaceRaised }]}
        accessibilityLabel={`Scan a barcode to add to ${MEAL_LABELS[meal]}`}
      >
        <Ionicons name="barcode-outline" size={18} color={colors.text} />
      </Tappable>
      <Tappable
        onPress={() => router.push({ pathname: '/search', params: { meal } })}
        scaleTo={0.9}
        style={[styles.iconButton, { backgroundColor: colors.accent }]}
        accessibilityLabel={`Search for a food to add to ${MEAL_LABELS[meal]}`}
      >
        <Ionicons name="add" size={18} color={colors.onFill} />
      </Tappable>
    </View>
  );

  useEffect(() => {
    let live = true;
    void lastMealsBefore(selectedDate).then((found) => {
      if (live) setRecentMeals(found);
    });
    return () => {
      live = false;
    };
  }, [selectedDate, entries]);

  const repeatMeal = async (meal: Meal, from: ISODate) => {
    if (repeating !== null) return;
    setRepeating(meal);
    try {
      await copyDay(from, [meal]);
    } finally {
      setRepeating(null);
    }
  };

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

  const isToday = selectedDate === todayISO();

  // Asked on today's screen about yesterday, because that is where people are:
  // almost nobody goes back through past days to tidy them.
  const yesterday = addDays(todayISO(), -1);
  const yesterdayKcal = observations.find((o) => o.date === yesterday)?.intakeKcal;
  const askAboutYesterday =
    ready && isToday && shouldAskAbout(yesterdayKcal, dayStatus.get(yesterday), program.calories.kcal);
  const leftOut = dayStatus.get(selectedDate) === false;

  return (
    <Screen
      title="Today"
      subtitle={formatDateLong(selectedDate)}
      action={
        <Tappable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" style={styles.gear}>
          <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
        </Tappable>
      }
    >
      <HomeScreenNotice />
      <ActiveWorkoutBanner />
      <FirstWeekCalibrationCard />
      <MissionBanner />
      <View style={styles.dateNav}>
        <Pressable
          onPress={() => setSelectedDate(addDays(selectedDate, -1))}
          accessibilityLabel="Go to the previous day"
          style={[styles.navButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => setSelectedDate(todayISO())}
          style={[styles.navButton, styles.navToday, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: isToday ? colors.textFaint : colors.accent, fontFamily: font.uiStrong }}>
            {isToday ? 'Today' : 'Jump to today'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSelectedDate(addDays(selectedDate, 1))}
          // Logging into the future would feed the estimator days that have not
          // happened yet, so forward navigation stops at today.
          disabled={isToday}
          accessibilityLabel="Go to the next day"
          style={[
            styles.navButton,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: isToday ? 0.35 : 1 },
          ]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      {/* When Workouts Spotlight is active, lead with Workout Routine */}
      {settings.dashboardSpotlight === 'workouts' && (
        <Pressable
          onPress={() => router.push('/train')}
          style={({ pressed }) => [
            styles.trainingShortcut,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open workout routines"
        >
          <View style={styles.trainingShortcutLeft}>
            <View style={[styles.trainingIconBubble, { backgroundColor: '#FF6B4A22', borderColor: '#FF6B4A55' }]}>
              <Ionicons name="barbell-outline" size={18} color="#FF6B4A" />
            </View>
            <View style={{ gap: 2, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.trainingShortcutTitle, { color: colors.text }]}>
                  Workout & Routines
                </Text>
                <View style={[styles.trainingTag, { backgroundColor: '#FF6B4A20' }]}>
                  <Text style={styles.trainingTagText}>TRAIN</Text>
                </View>
              </View>
              <Text style={[styles.trainingShortcutSubtitle, { color: colors.textMuted }]}>
                Track session, log reps & crush your PRs →
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      {/* Daily Macro Targets Card */}
      <Card>
        <MacroSummary consumed={totals} target={program.macros} />
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
            <Ionicons name="sparkles" size={12} color="#F59E0B" />
            <Text style={[styles.stickerPillText, { color: colors.text }]}>
              Story Sticker ✨
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
      </Card>

      {/* When Balanced or Nutrition Spotlight, workout shortcut sits neatly below macros */}
      {settings.dashboardSpotlight !== 'workouts' && (
        <Pressable
          onPress={() => router.push('/train')}
          style={({ pressed }) => [
            styles.trainingShortcut,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open workout routines"
        >
          <View style={styles.trainingShortcutLeft}>
            <View style={[styles.trainingIconBubble, { backgroundColor: '#FF6B4A22', borderColor: '#FF6B4A55' }]}>
              <Ionicons name="barbell-outline" size={18} color="#FF6B4A" />
            </View>
            <View style={{ gap: 2, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.trainingShortcutTitle, { color: colors.text }]}>
                  Workout & Routines
                </Text>
                <View style={[styles.trainingTag, { backgroundColor: '#FF6B4A20' }]}>
                  <Text style={styles.trainingTagText}>TRAIN</Text>
                </View>
              </View>
              <Text style={[styles.trainingShortcutSubtitle, { color: colors.textMuted }]}>
                Track session, log reps & crush your PRs →
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      {/* Clinical Micronutrient DRI Quality Card (Always Active) */}
      <NutritionQualityCard
        consumed={totals}
        entries={entries}
        profile={settings.profile}
      />

      {/* Morning Scale Weight & Check-in (Always Active) */}
      {isToday && <CheckInCard />}

      {askAboutYesterday && yesterdayKcal !== undefined && (
        <View style={[styles.banner, styles.question, { backgroundColor: colors.surfaceRaised, borderColor: colors.warning }]}>
          <Text style={[styles.questionTitle, { color: colors.text }]}>
            Yesterday's log came to {Math.round(yesterdayKcal)} kcal. Was that everything?
          </Text>
          <Text style={[styles.bannerText, { color: colors.textMuted }]}>
            If a meal is missing, leaving the day out stops it from lowering your target.
          </Text>
          <View style={styles.questionActions}>
            <Pressable
              onPress={() => void markDay(yesterday, true)}
              style={[styles.dayAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.dayActionLabel, { color: colors.text }]}>Yes, logged everything</Text>
            </Pressable>
            <Pressable
              onPress={() => void markDay(yesterday, false)}
              style={[styles.dayAction, { backgroundColor: colors.surface, borderColor: colors.warning }]}
            >
              <Text style={[styles.dayActionLabel, { color: colors.text }]}>Exclude from estimate</Text>
            </Pressable>
          </View>
        </View>
      )}



      <View style={styles.dayActions}>
        <Pressable
          onPress={() => router.push({ pathname: '/quick-add', params: { meal: 'snack' } })}
          style={[styles.dayAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="flash-outline" size={16} color={colors.text} />
          <Text style={[styles.dayActionLabel, { color: colors.text }]}>Quick add</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/repeat')}
          style={[styles.dayAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="repeat-outline" size={16} color={colors.text} />
          <Text style={[styles.dayActionLabel, { color: colors.text }]}>Repeat a day</Text>
        </Pressable>
      </View>

      {MEAL_ORDER.map((meal) => {
        const mealEntries = byMeal.get(meal) ?? [];
        const mealKcal = mealEntries.reduce((sum, entry) => sum + entry.nutrients.kcal, 0);

        return (
          <Card
            key={meal}
            title={MEAL_LABELS[meal]}
            subtitle={mealEntries.length ? `${Math.round(mealKcal)} kcal` : 'Ready to log'}
            right={!isCompact ? renderMealActions(meal) : undefined}
          >
            {isCompact && renderMealActions(meal, styles.mealActionsNarrow)}
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
                    <Text style={[styles.entryName, { color: colors.text }]} numberOfLines={1}>
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
              the last one logged this week in one tap, and only an empty one,
              so a meal cannot be doubled by accident.
            */}
            {mealEntries.length === 0 && recentMeals.has(meal) && (() => {
              const recent = recentMeals.get(meal)!;
              const label = sameAsLabel(recent.date, selectedDate);
              return (
                <Tappable
                  onPress={() => void repeatMeal(meal, recent.date)}
                  disabled={repeating !== null}
                  scaleTo={0.97}
                  accessibilityLabel={`${label} for ${MEAL_LABELS[meal]}`}
                  style={[styles.repeatChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                >
                  <Ionicons name="repeat-outline" size={15} color={colors.accent} />
                  <Text style={[styles.repeatLabel, { color: colors.text }]}>{label}</Text>
                  <Text style={[styles.repeatMeta, { color: colors.textFaint }]}>
                    {recent.items === 1 ? '1 item' : `${recent.items} items`} · {Math.round(recent.kcal)} kcal
                  </Text>
                </Tappable>
              );
            })()}
            {mealEntries.length > 0 && (
              <Text style={[styles.deleteHint, { color: colors.textFaint }]}>
                Tap an item to change the amount, hold to remove it
              </Text>
            )}
          </Card>
        );
      })}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  gear: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  dateNav: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  navButton: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navToday: { flex: 1 },
  targetLine: { fontFamily: font.ui, fontSize: 12, textAlign: 'center' },
  trainingShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.md,
  },
  trainingShortcutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flex: 1,
  },
  trainingIconBubble: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainingShortcutTitle: {
    fontFamily: font.uiStrong,
    fontSize: 14,
  },
  trainingTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  trainingTagText: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    color: '#FF6B4A',
    letterSpacing: 1,
  },
  trainingShortcutSubtitle: {
    fontFamily: font.ui,
    fontSize: 11,
  },
  macroCardFooter: {
    marginTop: space.sm,
    gap: space.xs,
    alignItems: 'center',
  },
  stickerPill: {
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
  mealActions: { flexDirection: 'row', gap: space.sm },
  mealActionsNarrow: { flexDirection: 'row', gap: space.sm, marginTop: space.xs, marginBottom: space.sm },
  // Thumb-sized. These sat at 30 px, which is below the ~44 px that a thumb
  // hits reliably, and they are two adjacent targets on one row.
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dayActionLabel: { fontFamily: font.uiStrong, fontSize: 13 },
});
