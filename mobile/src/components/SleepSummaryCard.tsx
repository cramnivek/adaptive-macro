import { addDays } from '@adaptive-macros/engine';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { listSleepSessions } from '../db/sleepQueries';
import { healthConnectSourceName, onHealthConnectSynced, sleepAccessGranted } from '../health/healthConnect';
import { summarizeSleep, type SleepSummary } from '../health/sleep';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Button } from './Controls';
import { Card } from './Card';

const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export const SleepSummaryCard = () => {
  const { selectedDate, ready, entries } = useApp();
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
  const text = { color: colors.textMuted };
  const line = (night: SleepSummary) => night.sleepMinutes === null
    ? `${duration(night.sessionMinutes)} session · sleep duration unavailable`
    : `${duration(night.sleepMinutes)} recorded sleep · ${duration(night.sessionMinutes)} session`;
  const sleepWindow = (night: SleepSummary) => {
    const clock = (time: number) => new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `${clock(night.start)} → ${clock(night.end)}`;
  };

  return (
    <Card title="Sleep" subtitle={`Night ending ${selectedDate}`}>
      {status === 'loading' || (!current && status !== 'error') ? <Text style={[styles.note, text]}>Loading sleep…</Text>
        : status === 'error' ? <Text style={[styles.note, text]}>Sleep could not be loaded. Try syncing again from Account.</Text>
          : <>
            <Text style={[styles.note, { color: colors.text }]}>{selected ? line(selected) : 'No sleep imported for this night.'}</Text>
            {selected && <Text style={[styles.note, text]}>{sleepWindow(selected)} · this phone’s time zone</Text>}
            {selected && <Text style={[styles.note, text]}>Source: {selected.sources.map(healthConnectSourceName).join(', ')}</Text>}
            {!access && <Text style={[styles.note, text]}>{Platform.OS === 'android'
              ? 'Sleep access is optional. Allow it in Account → Health Connect; steps and weight work without it.'
              : 'Sleep import requires Android Health Connect. Saved sleep is still available here.'}</Text>}
            {access && !selected && <Text style={[styles.note, text]}>Check that Garmin Connect shares sleep with Health Connect, then sync from Account.</Text>}
            {selected && <Text style={[styles.note, text]}>Recorded sleep counts supplied sleep stages; gaps are unknown. A session can include awake time.</Text>}
            <Button label={expanded ? 'Hide seven nights' : 'View seven nights'} variant="subtle" onPress={() => setExpanded((value) => !value)} />
            {expanded && Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 6)).map((date) => {
              const night = nights.find((item) => item.date === date);
              return <View key={date} style={styles.night}>
                <Text style={[styles.note, { color: colors.text }]}>{date} · {night ? line(night) : 'No imported sleep'}</Text>
                {night && <Text style={[styles.note, text]}>{sleepWindow(night)} · {night.sources.map(healthConnectSourceName).join(', ')}</Text>}
              </View>;
            })}
          </>}
    </Card>
  );
};

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 13, lineHeight: 19, marginBottom: space.sm },
  night: { paddingVertical: space.xs },
});
