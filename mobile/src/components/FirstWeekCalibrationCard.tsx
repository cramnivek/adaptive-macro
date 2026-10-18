import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GoalDirection, Sex } from '@adaptive-macros/engine';
import { thud } from '../platform/haptics';
import { useApp } from '../state/AppStore';
import type { DashboardSpotlight, UnitSystem, UserMission } from '../state/settings';
import { font, radius, space, useTheme } from '../theme';
import { notify } from '../dialog';
import { Card } from './Card';
import { Button, Field, Segmented } from './Controls';
import { FadeIn } from './FadeIn';
import { MissionPicker } from './MissionPicker';

const CALIBRATION_DISMISSED_KEY = 'ascend_first_week_calibration_dismissed';

export const FirstWeekCalibrationCard = () => {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings, updateSettings, observations, usingSeedEstimate, latest } = useApp();
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CALIBRATION_DISMISSED_KEY).then((val) => {
      if (val === 'true') {
        setIsDismissed(true);
      }
    });
  }, []);

  const handleDismiss = async () => {
    thud('light');
    setIsDismissed(true);
    await AsyncStorage.setItem(CALIBRATION_DISMISSED_KEY, 'true');
  };

  // Local state for initial onboarding fields
  const [onboardingStep, setOnboardingStep] = useState<'mission' | 'baseline'>('mission');
  const [selectedMission, setSelectedMission] = useState<UserMission>(
    settings.userMission ?? 'hybrid',
  );
  const [selectedSpotlight, setSelectedSpotlight] = useState<DashboardSpotlight>(
    settings.dashboardSpotlight ?? 'balanced',
  );
  const [units, setUnits] = useState<UnitSystem>(settings.units);
  const [sex, setSex] = useState<Sex>(settings.profile.sex);
  const [goalDir, setGoalDir] = useState<GoalDirection>(settings.goal.direction);
  const [heightStr, setHeightStr] = useState('');
  const [weightStr, setWeightStr] = useState('');

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

  // State 1: Brand new user has not completed initial onboarding
  if (!settings.onboarded) {
    const handleSaveProfile = async () => {
      const heightNum = Number.parseFloat(heightStr);
      const weightNum = Number.parseFloat(weightStr);
      if (!Number.isFinite(heightNum) || heightNum <= 0 || !Number.isFinite(weightNum) || weightNum <= 0) {
        notify('Baseline required', 'Please enter your height and weight to establish your starting baseline.');
        return;
      }
      thud('heavy');
      const weightKg = units === 'imperial' ? weightNum / 2.20462 : weightNum;
      const heightCm = units === 'imperial' ? heightNum * 2.54 : heightNum;

      await updateSettings({
        onboarded: true,
        userMission: selectedMission,
        dashboardSpotlight: selectedSpotlight,
        missionOnboardingDismissed: true,
        featureOnboardingDismissed: true,
        units,
        workoutUnits: units,
        profile: {
          ...settings.profile,
          sex,
          heightCm: Math.round(heightCm),
        },
        goal: {
          direction: goalDir,
          rateKgPerWeek: goalDir === 'maintain' ? 0 : 0.5,
        },
        goalWeightKg: goalDir === 'maintain' ? weightKg : null,
      });
    };

    if (onboardingStep === 'mission') {
      return (
        <FadeIn>
          <Card variant="featured" style={styles.card}>
            <View style={styles.badgeRowBetween}>
              <View style={styles.badgeLeft}>
                <Ionicons name="sparkles" size={14} color={colors.accent} />
                <Text style={[styles.badgeText, { color: colors.accent }]}>
                  STEP 1 OF 2 · WHAT IS YOUR MISSION?
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  thud('light');
                  setOnboardingStep('baseline');
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Skip to baseline metrics"
              >
                <Text style={[styles.skipLink, { color: colors.textMuted }]}>
                  SKIP TO STATS →
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.title, { color: colors.text }]}>
              Choose your primary training mission
            </Text>
            <Text style={[styles.desc, { color: colors.textMuted }]}>
              Ascend personalizes your daily dashboard spotlight and coaching advice to match your mission.
            </Text>

            <MissionPicker
              selectedMission={selectedMission}
              selectedSpotlight={selectedSpotlight}
              onChangeMission={setSelectedMission}
              onChangeSpotlight={setSelectedSpotlight}
            />

            <View style={{ marginTop: space.sm }}>
              <Button
                label="NEXT: SET BASELINE STATS →"
                onPress={() => {
                  thud('heavy');
                  setOnboardingStep('baseline');
                }}
              />
            </View>
          </Card>
        </FadeIn>
      );
    }

    return (
      <FadeIn>
        <Card variant="featured" style={styles.card}>
          <View style={styles.badgeRowBetween}>
            <View style={styles.badgeLeft}>
              <Ionicons name="speedometer-outline" size={14} color={colors.accent} />
              <Text style={[styles.badgeText, { color: colors.accent }]}>
                STEP 2 OF 2 · DAY 1 BASELINE
              </Text>
            </View>
            <Pressable
              onPress={() => {
                thud('light');
                setOnboardingStep('mission');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back to mission focus"
            >
              <Text style={[styles.skipLink, { color: colors.accent }]}>
                ← EDIT MISSION
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Set your Day 1 baseline
          </Text>
          <Text style={[styles.desc, { color: colors.textMuted }]}>
            Your answers establish your starting target. Over your first 7 days, our adaptive model learns your actual metabolic rate from your logged meals and weight.
          </Text>

          <View style={styles.form}>
            <Segmented<UnitSystem>
              label="UNITS"
              value={units}
              onChange={(u) => {
                thud('light');
                const prev = units;
                setUnits(u);
                if (heightStr.trim()) {
                  const h = Number.parseFloat(heightStr);
                  if (Number.isFinite(h) && h > 0) {
                    if (u === 'imperial' && prev === 'metric') {
                      setHeightStr(String(Math.round(h / 2.54)));
                    } else if (u === 'metric' && prev === 'imperial') {
                      setHeightStr(String(Math.round(h * 2.54)));
                    }
                  }
                }
                if (weightStr.trim()) {
                  const w = Number.parseFloat(weightStr);
                  if (Number.isFinite(w) && w > 0) {
                    if (u === 'imperial' && prev === 'metric') {
                      setWeightStr((w * 2.20462).toFixed(1));
                    } else if (u === 'metric' && prev === 'imperial') {
                      setWeightStr((w / 2.20462).toFixed(1));
                    }
                  }
                }
              }}
              options={[
                { value: 'metric', label: 'Metric (kg · cm)' },
                { value: 'imperial', label: 'Imperial (lb · in)' },
              ]}
            />

            <Segmented<Sex>
              label="BIOLOGICAL SEX"
              value={sex}
              onChange={(s) => {
                thud('light');
                setSex(s);
              }}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
            />

            <Segmented<GoalDirection>
              label="PRIMARY GOAL"
              value={goalDir}
              onChange={(g) => {
                thud('light');
                setGoalDir(g);
              }}
              options={[
                { value: 'lose', label: 'Fat Loss' },
                { value: 'maintain', label: 'Maintain' },
                { value: 'gain', label: 'Muscle Gain' },
              ]}
            />

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Field
                  label={`HEIGHT (${units === 'imperial' ? 'IN' : 'CM'})`}
                  value={heightStr}
                  onChangeText={setHeightStr}
                  keyboardType="numeric"
                  placeholder={units === 'imperial' ? 'e.g. 68' : 'e.g. 175'}
                />
              </View>
              <View style={styles.col}>
                <Field
                  label={`WEIGHT (${units === 'imperial' ? 'LB' : 'KG'})`}
                  value={weightStr}
                  onChangeText={setWeightStr}
                  keyboardType="numeric"
                  placeholder={units === 'imperial' ? 'e.g. 155' : 'e.g. 70'}
                />
              </View>
            </View>

            <Button
              label="START ASCEND JOURNEY 🚀"
              onPress={handleSaveProfile}
            />
          </View>
        </Card>
      </FadeIn>
    );
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
      : '7-DAY BASELINE REACHED · FINALIZING'
    : 'FIRST-WEEK CALIBRATION';

  const titleText = isSevenDaysLogged
    ? needsWeight
      ? 'Add morning weigh-ins to finalize'
      : '7-day baseline established'
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
                You have completed 7 days of nutrition logging! To compute your true metabolic expenditure, the adaptive engine needs a few morning weigh-ins so it can compare your calorie intake against your body weight trend.
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
                Your first week of baseline data is recorded! The Kalman filter is actively narrowing down your true metabolic expenditure{latest?.expenditureSdKcal ? ` (current uncertainty: ±${Math.round(latest.expenditureSdKcal)} kcal)` : ''}. Over your next few days of tracking, your targets will automatically lock in.
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
