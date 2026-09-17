import type { LogEntry, Meal } from '@adaptive-macros/engine';
import { addDays, todayISO } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { TOUCH_TARGET } from '../../src/components/Controls';
import { EditEntrySheet } from '../../src/components/EditEntrySheet';
import { MacroSummary } from '../../src/components/MacroProgress';
import { Screen } from '../../src/components/Screen';
import { confirm } from '../../src/dialog';
import { MEAL_LABELS, formatDateLong } from '../../src/format';
import { useApp } from '../../src/state/AppStore';
import { radius, space, useTheme } from '../../src/theme';

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
    usingSeedEstimate,
    ready,
  } = useApp();

  const [editing, setEditing] = useState<LogEntry | null>(null);

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

  return (
    <Screen title="Today" subtitle={formatDateLong(selectedDate)}>
      <View style={styles.dateNav}>
        <Pressable
          onPress={() => setSelectedDate(addDays(selectedDate, -1))}
          style={[styles.navButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => setSelectedDate(todayISO())}
          style={[styles.navButton, styles.navToday, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ color: isToday ? colors.textFaint : colors.accent, fontWeight: '600' }}>
            {isToday ? 'Today' : 'Jump to today'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSelectedDate(addDays(selectedDate, 1))}
          // Logging into the future would feed the estimator days that have not
          // happened yet, so forward navigation stops at today.
          disabled={isToday}
          style={[
            styles.navButton,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: isToday ? 0.35 : 1 },
          ]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      <Card>
        <MacroSummary consumed={totals} target={program.macros} />
        <Text style={[styles.targetLine, { color: colors.textMuted }]}>
          Target {program.calories.kcal} kcal
          {program.calories.adjustmentKcal !== 0 &&
            ` · ${program.calories.adjustmentKcal > 0 ? '+' : ''}${program.calories.adjustmentKcal} vs expenditure`}
        </Text>
      </Card>

      {ready && usingSeedEstimate && (
        <Pressable onPress={() => router.push('/trends')}>
          <View style={[styles.banner, { backgroundColor: colors.surfaceRaised, borderColor: colors.warning }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Text style={[styles.bannerText, { color: colors.textMuted }]}>
              This target still comes from a formula estimate. Log weight and food daily for about two weeks
              and it will be measured from your own data.
            </Text>
          </View>
        </Pressable>
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
            subtitle={mealEntries.length ? `${Math.round(mealKcal)} kcal` : 'Nothing logged'}
            right={
              <View style={styles.mealActions}>
                <Pressable
                  onPress={() => router.push({ pathname: '/describe', params: { meal } })}
                  style={[styles.iconButton, { backgroundColor: colors.surfaceRaised }]}
                  accessibilityLabel={`Describe ${MEAL_LABELS[meal]} in words`}
                >
                  <Ionicons name="sparkles-outline" size={17} color={colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/scan', params: { meal } })}
                  style={[styles.iconButton, { backgroundColor: colors.surfaceRaised }]}
                  accessibilityLabel={`Scan a barcode for ${MEAL_LABELS[meal]}`}
                >
                  <Ionicons name="barcode-outline" size={18} color={colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/search', params: { meal } })}
                  style={[styles.iconButton, { backgroundColor: colors.accent }]}
                  accessibilityLabel={`Search for a food to add to ${MEAL_LABELS[meal]}`}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </Pressable>
              </View>
            }
          >
            {mealEntries.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => setEditing(entry)}
                onLongPress={() => void confirmDelete(entry)}
                style={({ pressed }) => [styles.entry, { opacity: pressed ? 0.6 : 1 }]}
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
              </Pressable>
            ))}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  targetLine: { fontSize: 12, marginTop: space.lg, textAlign: 'center' },
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    marginBottom: space.md,
  },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 17 },
  mealActions: { flexDirection: 'row', gap: space.sm },
  // Thumb-sized. These sat at 30 px, which is below the ~44 px that a thumb
  // hits reliably, and they are three adjacent targets on one row.
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
  entryName: { fontSize: 15, fontWeight: '500' },
  entryMeta: { fontSize: 11, marginTop: 1 },
  entryKcal: { fontSize: 15, fontVariant: ['tabular-nums'] },
  deleteHint: { fontSize: 11, marginTop: space.xs, textAlign: 'center' },
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
  dayActionLabel: { fontSize: 13, fontWeight: '600' },
});
