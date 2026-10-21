import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayISO } from '@adaptive-macros/engine';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  checkInStorageKey,
  earnedCheckIns,
  firstLoggedDate,
  loggedDays,
  type CheckInPeriod,
} from '../checkInSchedule';
import { formatDayMonth } from '../format';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Card } from './Card';
import { Button } from './Controls';
import { FadeIn } from './FadeIn';

const NOUN = { weekly: 'week', monthly: 'month', quarterly: 'quarter' } as const;

const dismissedKey = (period: CheckInPeriod) => `${checkInStorageKey(period)}_dismissed`;

/**
 * Says so on Today when a finished week, month or quarter has earned its
 * coaching check-in and it has not been read. The check-in itself lives on
 * Trends; this is the prompt, shown once per period until opened or put off.
 */
export const CheckInReadyCard = () => {
  const { colors } = useTheme();
  const router = useRouter();
  const { observations, dayStatus, settings } = useApp();
  const [ready, setReady] = useState<CheckInPeriod | null>(null);

  const earned = useMemo(
    () =>
      earnedCheckIns(
        firstLoggedDate(observations),
        todayISO(),
        loggedDays(observations, dayStatus),
        settings.checkInWeekEndsOn,
      ),
    [observations, dayStatus, settings.checkInWeekEndsOn],
  );

  // The first earned period with no saved review and no "not now" against it.
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (const period of earned) {
        const [saved, dismissed] = await Promise.all([
          AsyncStorage.getItem(checkInStorageKey(period)),
          AsyncStorage.getItem(dismissedKey(period)),
        ]);
        if (!saved && !dismissed) {
          if (alive) setReady(period);
          return;
        }
      }
      if (alive) setReady(null);
    })().catch(() => {
      if (alive) setReady(null);
    });
    return () => {
      alive = false;
    };
  }, [earned]);

  if (ready === null) return null;
  const noun = NOUN[ready.kind];

  return (
    <FadeIn>
      <Card variant="featured" title={`Your ${noun} is ready`}>
        <Text style={[styles.body, { color: colors.text }]}>
          {formatDayMonth(ready.from)} to {formatDayMonth(ready.to)} has enough logged days for a proper
          check-in: how your training, weight and food fitted together, and what to change.
        </Text>
        <View style={styles.actions}>
          <Button
            label="Open check-in"
            onPress={() => router.push({ pathname: '/trends', params: { checkin: ready.kind } })}
          />
          <Button
            label="Not now"
            variant="subtle"
            onPress={() => {
              setReady(null);
              void AsyncStorage.setItem(dismissedKey(ready), '1');
            }}
          />
        </View>
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  body: { fontFamily: font.ui, fontSize: 14, lineHeight: 20 },
  actions: { gap: space.sm, marginTop: space.md },
});
