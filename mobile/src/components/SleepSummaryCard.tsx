import { addDays } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { listSleepSessions } from '../db/sleepQueries';
import { healthConnectSourceName, onHealthConnectSynced, sleepAccessGranted } from '../health/healthConnect';
import { summarizeSleep, type SleepSummary } from '../health/sleep';
import { sleepAdvice } from '../health/sleepAdvice';
import { formatDayMonth } from '../format';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Button } from './Controls';
import { Card } from './Card';
import { AdviceNote } from './AdviceNote';

const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export const SleepSummaryCard = () => {
  const { selectedDate, ready, entries, settings } = useApp();
  const { colors } = useTheme();
  const [nights, setNights] = useState<SleepSummary[]>([]);
  const [access, setAccess] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sync, setSync] = useState(0);
  const [loadedFor, setLoadedFor] = useState<{ date: string; entries: typeof entries } | null>(null);

  useEffect(() => onHealthConnectSynced(() => setSync((value) => value + 1)), []);
  useEffect(() => {
    if (!ready) return;
    let current = true;
    setStatus('loading');
    setNights([]);
    void Promise.all([listSleepSessions(addDays(selectedDate, -6), selectedDate), sleepAccessGranted()])
      .then(([sessions, allowed]) => {
        if (!current) return;
        setNights(summarizeSleep(sessions));
        setAccess(allowed);
        setLoadedFor({ date: selectedDate, entries });
        setStatus('ready');
      })
      .catch(() => { if (current) setStatus('error'); });
    return () => { current = false; };
    // Diary refreshes also cover restoring and clearing account-local data.
  }, [ready, selectedDate, entries, sync]);

  if (!ready) return null;
  const current = loadedFor?.date === selectedDate && loadedFor.entries === entries;
  if (Platform.OS !== 'android' && (!current || nights.length === 0) && status !== 'error') return null;
  const selected = nights.find((night) => night.date === selectedDate);
  const advice = sleepAdvice(selected, nights, settings.profile.age);
  const days = Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 6));
  const chartMaximum = Math.max(720, ...nights.map((night) => night.sleepMinutes ?? 0));
  const text = { color: colors.textMuted };
  const line = (night: SleepSummary) => night.sleepMinutes === null
    ? `${duration(night.sessionMinutes)} session · sleep duration unavailable`
    : `${duration(night.sleepMinutes)} recorded sleep · ${duration(night.sessionMinutes)} session`;
  const sleepWindow = (night: SleepSummary) => {
    const clock = (time: number) => new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `${clock(night.start)} → ${clock(night.end)}`;
  };

  return (
    <Card variant="featured" tone="sleep" icon="moon-outline" title="Sleep" subtitle={`Ending ${formatDayMonth(selectedDate)}`}>
      {status === 'loading' || (!current && status !== 'error') ? <Text style={[styles.note, text]}>Loading sleep…</Text>
        : status === 'error' ? <Text style={[styles.note, text]}>Sleep could not be loaded. Try syncing again from Account.</Text>
          : <>
            {selected?.sleepMinutes != null && <View style={styles.durationRow}>
              <View style={styles.durationText}>
                <Text style={[styles.duration, { color: colors.text }]}>{duration(selected.sleepMinutes)}</Text>
                <Text style={[styles.note, text]}>Recorded sleep</Text>
              </View>
              <Ionicons name="moon-outline" size={44} color={colors.features.sleep.accent} accessible={false} />
            </View>}
            <Text style={[styles.assessment, { color: colors.text }]}>{advice.title}</Text>
            {nights.some((night) => night.sleepMinutes !== null) && <>
              <Text style={[styles.chartCaption, text]}>Recorded time · last 7 days</Text>
              <View style={styles.chart}>
                {days.map((date) => {
                  const minutes = nights.find((night) => night.date === date)?.sleepMinutes;
                  return <View key={date} style={styles.chartDay} accessible accessibilityLabel={`${formatDayMonth(date)}: ${minutes == null ? 'No sleep duration recorded' : `${duration(minutes)} recorded sleep`}`}>
                    <View style={styles.barSlot}>
                      {minutes == null ? <Text style={[styles.dayLabel, text]}>–</Text> : <View style={[styles.bar, { height: minutes > 0 ? Math.max(2, minutes / chartMaximum * 44) : 0, backgroundColor: colors.features.sleep.accent }]} />}
                    </View>
                    <Text style={[styles.dayLabel, text, date === selectedDate && { fontFamily: font.uiStrong, color: colors.features.sleep.accent }]}>{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'narrow' })}</Text>
                  </View>;
                })}
              </View>
            </>}
            <AdviceNote label={advice.state === 'enough' || advice.state === 'short' ? 'For tonight' : 'Next step'} tone="sleep">{advice.action}</AdviceNote>
            {advice.recent && <Text style={[styles.note, text]}>
              Across {advice.recent.nights} days with sleep data: {duration(advice.recent.averageMinutes)} average.
              {' '}{advice.recent.shortNights} below the {advice.minimumMinutes! / 60}-hour guide.
            </Text>}
            {!access && <Text style={[styles.note, text]}>{Platform.OS === 'android'
              ? 'Sleep access is not allowed. Request it in Account → Health Connect. If Sleep is missing from Ascend permissions, install the updated Android build.'
              : 'Sleep import requires Android Health Connect. Saved sleep is still available here.'}</Text>}
            {access && !selected && <Text style={[styles.note, text]}>Check that Garmin Connect shares sleep with Health Connect, then sync from Account.</Text>}
            <Button label={expanded ? 'Hide sleep details' : 'Sleep details & history'} variant="subtle" onPress={() => setExpanded((value) => !value)} />
            {expanded && <>
              {selected && <>
                <Text style={[styles.note, text]}>{line(selected)} · {selected.sources.map(healthConnectSourceName).join(', ')}</Text>
                <Text style={[styles.note, text]}>{sleepWindow(selected)} · local time</Text>
              </>}
              <Text style={[styles.note, text]}>
                {advice.minimumMinutes !== null ? `The general guide for your age is at least ${advice.minimumMinutes / 60} hours. ` : ''}
                Your tracker estimates time asleep; hours alone cannot tell how well you slept. Gaps in a recording are not counted as lost sleep.
              </Text>
            {days.map((date) => {
              const night = nights.find((item) => item.date === date);
              return <View key={date} style={styles.night}>
                <Text style={[styles.note, { color: colors.text }]}>{formatDayMonth(date)} · {night?.sleepMinutes != null ? duration(night.sleepMinutes) : 'No sleep duration recorded'}</Text>
              </View>;
            })}</>}
          </>}
    </Card>
  );
};

const styles = StyleSheet.create({
  assessment: { fontFamily: font.uiStrong, fontSize: 17, lineHeight: 23, marginBottom: space.sm },
  duration: { fontFamily: font.uiStrong, fontSize: 34, lineHeight: 44, fontVariant: ['tabular-nums'] },
  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginBottom: space.sm },
  durationText: { flex: 1 },
  chartCaption: { fontFamily: font.ui, fontSize: 11, marginTop: space.xs },
  chart: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, marginBottom: space.xs },
  chartDay: { flex: 1, alignItems: 'center', gap: space.xs },
  barSlot: { height: 44, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 12, borderRadius: 6 },
  dayLabel: { fontFamily: font.ui, fontSize: 11 },
  note: { fontFamily: font.ui, fontSize: 13, lineHeight: 19, marginBottom: space.sm },
  night: { paddingVertical: space.xs },
});
