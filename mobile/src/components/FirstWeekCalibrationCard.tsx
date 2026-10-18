import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GoalDirection, Sex } from '@adaptive-macros/engine';
import { thud } from '../platform/haptics';
import { useApp } from '../state/AppStore';
import type { UnitSystem } from '../state/settings';
import { font, radius, space, useTheme } from '../theme';
import { Card } from './Card';
import { Button, Field, Segmented } from './Controls';
import { FadeIn } from './FadeIn';

export const FirstWeekCalibrationCard = () => {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings, updateSettings, observations, usingSeedEstimate } = useApp();

  // Local state for initial onboarding fields
  const [units, setUnits] = useState<UnitSystem>(settings.units);
  const [sex, setSex] = useState<Sex>(settings.profile.sex);
  const [goalDir, setGoalDir] = useState<GoalDirection>(settings.goal.direction);
  const [heightStr, setHeightStr] = useState(String(settings.profile.heightCm));
  const [weightStr, setWeightStr] = useState(
    settings.units === 'imperial'
      ? '165'
      : '75',
  );

  // Calibration days logged in the last 14 days
  const calibratedDays = useMemo(() => {
    const withData = observations.filter(
      (o) => (o.intakeKcal !== undefined && o.intakeKcal > 0) || (o.weightKg !== undefined && o.weightKg > 0),
    );
    return Math.min(7, withData.length);
  }, [observations]);

  // If already onboarded and adaptive engine has completed calibration (not using seed estimate), nothing to show
  if (settings.onboarded && !usingSeedEstimate) {
    return null;
  }

  // State 1: Brand new user has not completed initial onboarding
  if (!settings.onboarded) {
    const handleSaveProfile = async () => {
      thud('heavy');
      const heightNum = Number.parseFloat(heightStr) || 178;
      const weightNum = Number.parseFloat(weightStr) || (units === 'imperial' ? 165 : 75);
      const weightKg = units === 'imperial' ? weightNum / 2.20462 : weightNum;
      const heightCm = units === 'imperial' ? heightNum * 2.54 : heightNum;

      await updateSettings({
        onboarded: true,
        units,
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

    return (
      <FadeIn>
        <Card variant="featured" style={styles.card}>
          <View style={styles.badgeRow}>
            <Ionicons name="sparkles" size={14} color={colors.accent} />
            <Text style={[styles.badgeText, { color: colors.accent }]}>WELCOME TO ASCEND</Text>
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
                setUnits(u);
                if (u === 'imperial' && units === 'metric') {
                  setWeightStr('165');
                  setHeightStr('70');
                } else if (u === 'metric' && units === 'imperial') {
                  setWeightStr('75');
                  setHeightStr('178');
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
                  placeholder={units === 'imperial' ? '70' : '178'}
                />
              </View>
              <View style={styles.col}>
                <Field
                  label={`WEIGHT (${units === 'imperial' ? 'LB' : 'KG'})`}
                  value={weightStr}
                  onChangeText={setWeightStr}
                  keyboardType="numeric"
                  placeholder={units === 'imperial' ? '165' : '75'}
                />
              </View>
            </View>

            <Button
              label="SAVE & START FIRST WEEK"
              onPress={handleSaveProfile}
            />
          </View>
        </Card>
      </FadeIn>
    );
  }

  // State 2: Onboarded, but still calibrating in the first week
  const progressPct = Math.min(100, Math.round((calibratedDays / 7) * 100));

  return (
    <FadeIn>
      <Card variant="featured" style={styles.card}>
        <View style={styles.badgeRow}>
          <Ionicons name="speedometer-outline" size={14} color={colors.accent} />
          <Text style={[styles.badgeText, { color: colors.accent }]}>FIRST-WEEK CALIBRATION</Text>
        </View>

        <View style={styles.calibHeader}>
          <Text style={[styles.title, { color: colors.text }]}>
            Learning your metabolic burn rate
          </Text>
          <View style={[styles.pill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Text style={[styles.pillText, { color: colors.accent }]}>
              {calibratedDays} / 7 DAYS
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={[styles.barTrack, { backgroundColor: colors.surfaceRaised }]}>
          <View
            style={[
              styles.barFill,
              { width: `${progressPct}%`, backgroundColor: colors.accent },
            ]}
          />
        </View>

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
  badgeText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
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
