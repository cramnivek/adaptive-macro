import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { thud } from '../platform/haptics';
import { useApp } from '../state/AppStore';
import { font, radius, space, useTheme } from '../theme';
import { Card } from './Card';
import { Button } from './Controls';
import { FadeIn } from './FadeIn';

const CALIBRATION_DISMISSED_KEY = 'ascend_first_week_calibration_dismissed';

export const FirstWeekCalibrationCard = () => {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings, observations, usingSeedEstimate, latest } = useApp();
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CALIBRATION_DISMISSED_KEY)
      .then((val) => {
        if (val === 'true') {
          setIsDismissed(true);
        }
      })
      // Unreadable, the card shows again; that costs a tap, not data.
      .catch(() => undefined);
  }, []);

  const handleDismiss = async () => {
    thud('light');
    setIsDismissed(true);
    await AsyncStorage.setItem(CALIBRATION_DISMISSED_KEY, 'true');
  };

  // Calibration days logged in the last 14 days
  const calibratedDays = useMemo(() => {
    const withData = observations.filter(
      (o) => (o.intakeKcal !== undefined && o.intakeKcal > 0) || (o.weightKg !== undefined && o.weightKg > 0),
    );
    return Math.min(7, withData.length);
  }, [observations]);

  const weightDays = useMemo(() => {
    return observations.filter((o) => o.weightKg !== undefined && o.weightKg > 0).length;
  }, [observations]);

  // If already onboarded and adaptive engine has completed calibration (not using seed estimate),
  // or if user explicitly dismissed the card, nothing to show.
  if (settings.onboarded && (!usingSeedEstimate || isDismissed)) {
    return null;
  }

  // Not set up yet: the onboarding screen asks for everything, and AuthGate
  // sends people there. The card used to embed its own copy of the form,
  // with answers preselected.
  if (!settings.onboarded) {
    return null;
  }

  // State 2: Onboarded, but still calibrating in the first week
  const isSevenDaysLogged = calibratedDays >= 7;
  const needsWeight = isSevenDaysLogged && weightDays < 3;
  const progressPct = Math.min(100, Math.round((calibratedDays / 7) * 100));

  const badgeIcon = isSevenDaysLogged
    ? needsWeight
      ? 'scale-outline'
      : 'checkmark-circle'
    : 'speedometer-outline';

  const badgeColor = isSevenDaysLogged && !needsWeight ? colors.positive : colors.accent;

  const badgeLabel = isSevenDaysLogged
    ? needsWeight
      ? '7 DAYS LOGGED · WEIGH-INS NEEDED'
      : 'FIRST WEEK DONE'
    : 'FIRST-WEEK CALIBRATION';

  const titleText = isSevenDaysLogged
    ? needsWeight
      ? 'Add morning weigh-ins to finalize'
      : 'Your target now follows you'
    : 'Learning your metabolic burn rate';

  return (
    <FadeIn>
      <Card variant="featured" style={styles.card}>
        <View style={styles.badgeRowBetween}>
          <View style={styles.badgeLeft}>
            <Ionicons name={badgeIcon} size={14} color={badgeColor} />
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
          <Pressable
            onPress={handleDismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Hide calibration notice"
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.calibHeader}>
          <Text style={[styles.title, { color: colors.text }]}>
            {titleText}
          </Text>
          <View style={[styles.pill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Text style={[styles.pillText, { color: badgeColor }]}>
              {calibratedDays} / 7 DAYS{isSevenDaysLogged && !needsWeight ? ' ✓' : ''}
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={[styles.barTrack, { backgroundColor: colors.surfaceRaised }]}>
          <View
            style={[
              styles.barFill,
              { width: `${progressPct}%`, backgroundColor: badgeColor },
            ]}
          />
        </View>

        {isSevenDaysLogged ? (
          needsWeight ? (
            <>
              <Text style={[styles.desc, { color: colors.textMuted }]}>
                Seven days of food are logged. To work out what you actually burn, the app also needs a few morning weigh-ins, so it can compare what you ate with how your weight moved.
              </Text>
              <View style={styles.actionRow}>
                <View style={styles.actionCol}>
                  <Button
                    label="LOG MORNING WEIGHT"
                    variant="primary"
                    onPress={() => router.push('/weight')}
                  />
                </View>
                <View style={styles.actionCol}>
                  <Button
                    label="GOT IT"
                    variant="subtle"
                    onPress={handleDismiss}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.desc, { color: colors.textMuted }]}>
                {/* Plain words for the filter's state. The ± is one standard
                    deviation, so "give or take" rather than a hard limit, and the
                    target keeps adapting after this, so nothing "locks in". */}
                {`A week of logging is in. Your daily burn is now measured from your own food and weight${
                  latest?.expenditureSdKcal
                    ? `, give or take about ${Math.round(latest.expenditureSdKcal / 10) * 10} kcal for now`
                    : ''
                }. That range narrows with every day you log, and your target moves with it.`}
              </Text>
              <View style={styles.actionRow}>
                <View style={styles.actionCol}>
                  <Button
                    label="VIEW TRENDS"
                    variant="subtle"
                    onPress={() => router.push('/trends')}
                  />
                </View>
                <View style={styles.actionCol}>
                  <Button
                    label="GOT IT"
                    variant="subtle"
                    onPress={handleDismiss}
                  />
                </View>
              </View>
            </>
          )
        ) : (
          <>
            <Text style={[styles.desc, { color: colors.textMuted }]}>
              Your daily targets currently use a formula estimate. Log your morning weight and meals each day to calibrate your true expenditure.
            </Text>

            <View style={styles.tips}>
              <View style={styles.tipRow}>
                <Ionicons name="sunny-outline" size={15} color={colors.accent} />
                <Text style={[styles.tipText, { color: colors.textMuted }]}>
                  Weigh in each morning before eating or drinking.
                </Text>
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="restaurant-outline" size={15} color={colors.accent} />
                <Text style={[styles.tipText, { color: colors.textMuted }]}>
                  Log everything you eat (or exclude untracked days to keep math clean).
                </Text>
              </View>
            </View>

            <Button
              label="VIEW TRENDS & EXPENDITURE"
              variant="subtle"
              onPress={() => router.push('/trends')}
            />
          </>
        )}
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    marginBottom: space.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.xs,
  },
  badgeRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  badgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  badgeText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  skipLink: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  calibHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  title: {
    fontFamily: font.display,
    fontSize: 18,
    lineHeight: 24,
    flex: 1,
  },
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    fontFamily: font.figure,
    fontSize: 11,
    fontWeight: '700',
  },
  barTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginVertical: space.sm,
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  desc: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    marginTop: space.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  actionCol: {
    flex: 1,
  },
  form: {
    marginTop: space.sm,
    gap: space.sm,
  },
  twoCol: {
    flexDirection: 'row',
    gap: space.sm,
  },
  col: {
    flex: 1,
  },
  tips: {
    gap: space.xs + 2,
    marginVertical: space.md,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
  },
  tipText: {
    fontFamily: font.ui,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
});
