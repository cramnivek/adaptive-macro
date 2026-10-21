import type { ActivityLevel, GoalDirection, Sex } from '@adaptive-macros/engine';
import { paceForGoal, todayISO } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { notify } from '../dialog';
import { thud } from '../platform/haptics';
import { pushBaselineToCloud } from '../social/baselineSync';
import { useApp } from '../state/AppStore';
import {
  type UnitSystem,
  withDefaults,
} from '../state/settings';
import { font, radius, space, useTheme } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Card } from './Card';
import { Button, Field, Segmented } from './Controls';
import { FadeIn } from './FadeIn';
import { GoalPlanner, type GoalPlan } from './GoalPlanner';

export interface OnboardingWizardProps {
  onComplete?: () => void;
}

export const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const { colors } = useTheme();
  const { settings, updateSettings, recordWeight } = useApp();

  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>(
    settings.units === 'imperial' ? 'in' : 'cm',
  );
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>(
    settings.units === 'imperial' ? 'lb' : 'kg',
  );
  const [sex, setSex] = useState<Sex>(settings.profile.sex);
  const [ageStr, setAgeStr] = useState(
    settings.onboarded ? String(settings.profile.age) : '',
  );
  const [heightStr, setHeightStr] = useState('');
  const [weightStr, setWeightStr] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>(settings.activity);
  const [goalDir, setGoalDir] = useState<GoalDirection>(settings.goal.direction);
  /** A goal weight and date, when given; without one the old default rates stand. */
  const [plan, setPlan] = useState<GoalPlan | null>(null);
  const [attempted, setAttempted] = useState(false);

  const toggleHeightUnit = () => {
    thud('light');
    const next = heightUnit === 'cm' ? 'in' : 'cm';
    setHeightUnit(next);
    if (heightStr.trim()) {
      const h = Number.parseFloat(heightStr);
      if (Number.isFinite(h) && h > 0) {
        if (next === 'in') {
          setHeightStr(String(Math.round(h / 2.54)));
        } else {
          setHeightStr(String(Math.round(h * 2.54)));
        }
      }
    }
  };

  const toggleWeightUnit = () => {
    thud('light');
    const next = weightUnit === 'kg' ? 'lb' : 'kg';
    setWeightUnit(next);
    if (weightStr.trim()) {
      const w = Number.parseFloat(weightStr);
      if (Number.isFinite(w) && w > 0) {
        if (next === 'lb') {
          setWeightStr((w * 2.20462).toFixed(1));
        } else {
          setWeightStr((w / 2.20462).toFixed(1));
        }
      }
    }
  };

  const parsedAge = Math.round(Number.parseFloat(ageStr));
  const parsedHeight = Number.parseFloat(heightStr);
  const parsedWeight = Number.parseFloat(weightStr);

  const isAgeInvalid = attempted && (!ageStr.trim() || !Number.isFinite(parsedAge) || parsedAge < 13 || parsedAge > 100);
  const isHeightInvalid = attempted && (!heightStr.trim() || !Number.isFinite(parsedHeight) || parsedHeight <= 0);
  const isWeightInvalid = attempted && (!weightStr.trim() || !Number.isFinite(parsedWeight) || parsedWeight <= 0);

  const handleSaveProfile = async () => {
    setAttempted(true);
    const ageNum = Math.round(Number.parseFloat(ageStr));
    const heightNum = Number.parseFloat(heightStr);
    const weightNum = Number.parseFloat(weightStr);
    if (
      !Number.isFinite(ageNum) ||
      ageNum < 13 ||
      ageNum > 100 ||
      !Number.isFinite(heightNum) ||
      heightNum <= 0 ||
      !Number.isFinite(weightNum) ||
      weightNum <= 0
    ) {
      notify(
        'Baseline required',
        'Please enter a valid age (13–100), height, and weight to establish your starting baseline.',
      );
      return;
    }
    thud('heavy');
    const weightKg = weightUnit === 'lb' ? weightNum / 2.20462 : weightNum;
    const roundedWeightKg = Math.round(weightKg * 100) / 100;
    const heightCm = Math.round(heightUnit === 'in' ? heightNum * 2.54 : heightNum);
    const effectiveUnits: UnitSystem = weightUnit === 'lb' ? 'imperial' : 'metric';

    // Worked out again from the weight as finally entered, in case it changed
    // after the goal was typed.
    const pace = plan !== null ? paceForGoal(roundedWeightKg, plan.goalWeightKg, plan.weeks) : null;

    const patch = {
      onboarded: true,
      // The focus picker left first run: it only changes labels, and the goal
      // below is what sets targets. Whatever focus is stored stays, and
      // Settings is where to change it.
      missionOnboardingDismissed: true,
      featureOnboardingDismissed: true,
      units: effectiveUnits,
      workoutUnits: effectiveUnits,
      activity,
      profile: {
        ...settings.profile,
        sex,
        age: ageNum,
        heightCm,
      },
      // A goal weight and date set the rate; the numbers decide the direction,
      // so a goal weight above today's weight is a gain whichever chip was on.
      goal:
        goalDir !== 'maintain' && pace !== null
          ? { direction: pace.direction, rateKgPerWeek: pace.rateKgPerWeek }
          : {
              direction: goalDir,
              rateKgPerWeek: goalDir === 'maintain' ? 0 : goalDir === 'gain' ? 0.25 : 0.5,
            },
      goalWeightKg:
        goalDir === 'maintain' ? roundedWeightKg : plan !== null ? Math.round(plan.goalWeightKg * 100) / 100 : null,
    };

    await recordWeight(todayISO(), roundedWeightKg);
    await updateSettings(patch);
    void pushBaselineToCloud(withDefaults({ ...settings, ...patch }), roundedWeightKg);
    onComplete?.();
  };

  return (
    <FadeIn>
      <View style={styles.container}>
        <Card variant="featured" style={styles.card}>
          {/* Title & Concise Subtitle */}
          <Text style={[styles.title, { color: colors.text }]}>A few numbers to start from</Text>
          <Text style={[styles.desc, { color: colors.textMuted }]}>
            These set your first targets. Once you have logged food and weight for a week or two, the
            estimate comes from your own numbers instead.
          </Text>

            <View style={styles.form}>
              {/* Biological Sex */}
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

              {/* Age, Height, Weight Row */}
              <View style={styles.threeCol}>
                <View style={styles.col}>
                  <Field
                    label="AGE"
                    value={ageStr}
                    onChangeText={setAgeStr}
                    keyboardType="numeric"
                    placeholder="28"
                    error={isAgeInvalid}
                  />
                </View>
                <View style={styles.col}>
                  <Field
                    label={`HEIGHT (${heightUnit.toUpperCase()})`}
                    labelRight={<Ionicons name="swap-horizontal" size={13} color={loud.loud} />}
                    onPressLabel={toggleHeightUnit}
                    value={heightStr}
                    onChangeText={setHeightStr}
                    keyboardType="numeric"
                    placeholder={heightUnit === 'in' ? '68' : '175'}
                    error={isHeightInvalid}
                  />
                </View>
                <View style={styles.col}>
                  <Field
                    label={`WEIGHT (${weightUnit.toUpperCase()})`}
                    labelRight={<Ionicons name="swap-horizontal" size={13} color={loud.loud} />}
                    onPressLabel={toggleWeightUnit}
                    value={weightStr}
                    onChangeText={setWeightStr}
                    keyboardType="numeric"
                    placeholder={weightUnit === 'lb' ? '155' : '70'}
                    error={isWeightInvalid}
                  />
                </View>
              </View>

              {attempted && (isAgeInvalid || isHeightInvalid || isWeightInvalid) && (
                <View
                  style={[
                    styles.inlineErrorRow,
                    {
                      backgroundColor: 'rgba(224, 108, 96, 0.12)',
                      borderColor: colors.danger,
                    },
                  ]}
                >
                  <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                  <Text style={[styles.inlineErrorText, { color: colors.danger }]}>
                    Please enter a valid age (13–100), height, and weight to calculate your baseline.
                  </Text>
                </View>
              )}

              {/* Activity Level */}
              <Segmented<ActivityLevel>
                label="ACTIVITY LEVEL"
                value={activity}
                onChange={(a) => {
                  thud('light');
                  setActivity(a);
                }}
                options={[
                  { value: 'sedentary', label: 'Low' },
                  { value: 'light', label: 'Light' },
                  { value: 'moderate', label: 'Mod' },
                  { value: 'active', label: 'High' },
                  { value: 'veryActive', label: 'Max' },
                ]}
              />

              {/* Primary Goal */}
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

              {goalDir !== 'maintain' && (
                // Keyed by unit, so switching kg and lb starts the goal afresh
                // rather than reading 165 lb as 165 kg.
                <GoalPlanner
                  key={weightUnit}
                  currentKg={(() => {
                    const n = Number.parseFloat(weightStr.replace(',', '.'));
                    if (!Number.isFinite(n) || n <= 0) return null;
                    return weightUnit === 'lb' ? n / 2.20462 : n;
                  })()}
                  units={weightUnit === 'lb' ? 'imperial' : 'metric'}
                  initialGoalKg={null}
                  onPlan={setPlan}
                />
              )}

              {/* Finish CTA */}
              <View style={styles.finishButtonWrapper}>
                <Button
                  label="Start"
                  onPress={() => void handleSaveProfile()}
                />
              </View>
            </View>
        </Card>
      </View>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  card: {
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: space.xl,
  },
  title: {
    fontFamily: font.display,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  desc: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: space.md,
  },
  form: {
    gap: space.md,
    marginTop: space.xs,
  },
  threeCol: {
    flexDirection: 'row',
    gap: space.sm,
  },
  col: {
    flex: 1,
  },
  finishButtonWrapper: {
    marginTop: space.sm,
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  inlineErrorText: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 16,
  },
});
