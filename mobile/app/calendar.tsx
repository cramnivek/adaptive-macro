import { todayISO } from '@adaptive-macros/engine';
import type { ISODate } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { monthGrid, monthTitle, shiftMonth } from '../src/calendarMonth';
import { sessionsBetween } from '../src/db';
import { formatDate } from '../src/format';
import { font, radius, space } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';

type Trained = Awaited<ReturnType<typeof sessionsBetween>>;

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The days you trained, a month at a time.
 *
 * The Train tab lists five recent sessions, which leaves everything older out
 * of reach and says nothing about rhythm. Here a trained day is a red square,
 * and tapping one opens the same past-workout screen the list does, so there is
 * one place a workout is looked at, shared or deleted.
 */
export default function CalendarScreen() {
  const router = useRouter();
  const today = todayISO();
  const nowYear = Number(today.slice(0, 4));
  const nowMonth = Number(today.slice(5, 7));

  const [view, setView] = useState({ year: nowYear, month: nowMonth });
  const [trained, setTrained] = useState<Trained>([]);
  /** A day with several sessions that was tapped, whose sessions are listed under the grid. */
  const [picked, setPicked] = useState<ISODate | null>(null);

  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);

  // Reloaded on focus rather than on mount, so a workout deleted from the
  // past-workout screen is gone from the calendar when you come back to it.
  useFocusEffect(
    useCallback(() => {
      let current = true;
      const days = grid.flat().filter((day) => day.inMonth);
      void (async () => {
        const found = await sessionsBetween(days[0]!.date, days[days.length - 1]!.date);
        if (current) setTrained(found);
      })();
      return () => {
        current = false;
      };
    }, [grid]),
  );

  const byDate = useMemo(() => {
    const map = new Map<ISODate, Trained>();
    for (const session of trained) map.set(session.date, [...(map.get(session.date) ?? []), session]);
    return map;
  }, [trained]);

  // Future months have nothing in them, so there is nowhere to go past this one.
  const atCurrent = view.year === nowYear && view.month === nowMonth;

  const go = (by: -1 | 1) => {
    setView(shiftMonth(view.year, view.month, by));
    // The old month's sessions would otherwise show for a moment against the
    // new month's dates, and a picked day belongs to the month it was in.
    setTrained([]);
    setPicked(null);
  };

  const open = (id: string) => router.push(`/workout?id=${id}`);

  const tapDay = (date: ISODate) => {
    const sessions = byDate.get(date);
    if (!sessions) return;
    if (sessions.length === 1) open(sessions[0]!.id);
    else setPicked(date);
  };

  const pickedSessions = picked ? (byDate.get(picked) ?? []) : [];

  return (
    <Screen tone="loud">
      <View style={styles.header}>
        <Pressable
          onPress={() => go(-1)}
          style={styles.step}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={22} color={loud.figure} />
        </Pressable>
        <Text style={styles.title}>{monthTitle(view.year, view.month)}</Text>
        <Pressable
          onPress={() => go(1)}
          disabled={atCurrent}
          style={[styles.step, atCurrent && styles.stepOff]}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: atCurrent }}
        >
          <Ionicons name="chevron-forward" size={22} color={loud.figure} />
        </Pressable>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((label, index) => (
          <View key={index} style={styles.cell}>
            <Text style={styles.weekday}>{label}</Text>
          </View>
        ))}
      </View>

      {grid.map((row) => (
        <View key={row[0]!.date} style={styles.week}>
          {row.map((day) => {
            const sessions = day.inMonth ? byDate.get(day.date) : undefined;
            const face = (
              <View
                style={[
                  styles.face,
                  day.date === today && styles.today,
                  sessions && styles.trained,
                ]}
              >
                <Text
                  style={[
                    styles.number,
                    !day.inMonth && styles.numberOut,
                    sessions && styles.numberTrained,
                  ]}
                >
                  {Number(day.date.slice(8, 10))}
                </Text>
              </View>
            );
            return sessions ? (
              <Tappable
                key={day.date}
                onPress={() => tapDay(day.date)}
                scaleTo={0.94}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityLabel={`${formatDate(day.date)}, ${
                  sessions.length === 1 ? sessions[0]!.name : `${sessions.length} workouts`
                }`}
              >
                {face}
              </Tappable>
            ) : (
              <View key={day.date} style={styles.cell}>
                {face}
              </View>
            );
          })}
        </View>
      ))}

      <Text style={styles.summary}>
        {trained.length} {trained.length === 1 ? 'workout' : 'workouts'} this month
      </Text>

      {picked && pickedSessions.length > 1 && (
        <Card loud title={formatDate(picked)}>
          {pickedSessions.map((session) => (
            <Tappable
              key={session.id}
              onPress={() => open(session.id)}
              scaleTo={0.99}
              style={[styles.row, { borderColor: loud.rule }]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${session.name}, ${formatDate(session.date)}`}
            >
              <Text style={styles.rowName} numberOfLines={1}>
                {session.name}
              </Text>
              <Text style={styles.rowOpen}>Open</Text>
            </Tappable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  step: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { opacity: 0.3 },
  title: { fontFamily: font.display, fontSize: 20, letterSpacing: -0.4, color: loud.figure },

  week: { flexDirection: 'row' },
  // Seven equal columns: a seventh of the row each, so the grid fills the width
  // whatever the phone.
  cell: { flexBasis: '14.2857%', maxWidth: '14.2857%', alignItems: 'center', justifyContent: 'center' },
  weekday: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1.2,
    color: loud.figureFaint,
    paddingBottom: space.xs,
  },
  face: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginVertical: 2,
  },
  today: { borderColor: loud.figureMuted },
  trained: { backgroundColor: loud.loud },
  number: { fontFamily: font.ui, fontSize: 15, color: loud.figure, fontVariant: ['tabular-nums'] },
  numberOut: { color: loud.figureFaint, opacity: 0.5 },
  numberTrained: { fontFamily: font.uiStrong, color: loud.onLoud },

  summary: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    color: loud.figureMuted,
    marginTop: space.md,
    marginBottom: space.xl,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
  },
  rowName: { flex: 1, fontFamily: font.uiStrong, color: loud.figure },
  rowOpen: { fontFamily: font.ui, fontSize: 13, color: loud.loud },
});
