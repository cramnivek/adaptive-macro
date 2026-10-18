import type { ActivityLevel, GoalDirection, Sex } from '@adaptive-macros/engine';
import { todayISO } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { notify } from '../dialog';
import { thud } from '../platform/haptics';
import { pushBaselineToCloud } from '../social/baselineSync';
import { useApp } from '../state/AppStore';
import {
  type DashboardSpotlight,
  type UnitSystem,
  type UserMission,
  withDefaults,
} from '../state/settings';
import { font, radius, space, useTheme } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Card } from './Card';
import { Button, Field, Segmented } from './Controls';
import { FadeIn } from './FadeIn';
import { MissionPicker } from './MissionPicker';

export interface OnboardingWizardProps {
  onComplete?: () => void;
}

export const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const { colors } = useTheme();
  const { settings, updateSettings, recordWeight } = useApp();

  const [onboardingStep, setOnboardingStep] = useState<'mission' | 'baseline'>('mission');
  const [selectedMission, setSelectedMission] = useState<UserMission>(
    settings.userMission ?? 'hybrid',
  );
  const [selectedSpotlight, setSelectedSpotlight] = useState<DashboardSpotlight>(
    settings.dashboardSpotlight ?? 'balanced',
  );
  const [units, setUnits] = useState<UnitSystem>(settings.units);
  const [sex, setSex] = useState<Sex>(settings.profile.sex);
  const [ageStr, setAgeStr] = useState(
    settings.onboarded ? String(settings.profile.age) : '',
  );
  const [heightStr, setHeightStr] = useState('');
  const [weightStr, setWeightStr] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>(settings.activity);
  const [goalDir, setGoalDir] = useState<GoalDirection>(settings.goal.direction);
  const [attempted, setAttempted] = useState(false);

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
    const weightKg = units === 'imperial' ? weightNum / 2.20462 : weightNum;
    const roundedWeightKg = Math.round(weightKg * 100) / 100;
    const heightCm = Math.round(units === 'imperial' ? heightNum * 2.54 : heightNum);

    const patch = {
      onboarded: true,
      userMission: selectedMission,
      dashboardSpotlight: selectedSpotlight,
      missionOnboardingDismissed: true,
      featureOnboardingDismissed: true,
      units,
      workoutUnits: units,
      activity,
      profile: {
        ...settings.profile,
        sex,
        age: ageNum,
        heightCm,
      },
      goal: {
        direction: goalDir,
        rateKgPerWeek: goalDir === 'maintain' ? 0 : goalDir === 'gain' ? 0.25 : 0.5,
      },
      goalWeightKg: goalDir === 'maintain' ? roundedWeightKg : null,
    };

    await recordWeight(todayISO(), roundedWeightKg);
    await updateSettings(patch);
    void pushBaselineToCloud(withDefaults({ ...settings, ...patch }), roundedWeightKg);
    onComplete?.();
  };

  const isMissionStep = onboardingStep === 'mission';

  return (
    <FadeIn>
      <View style={styles.container}>
        <Card variant="featured" style={styles.card}>
          {/* Top Header Row: Responsive Step Pill + Spacious Action Link */}
          <View style={styles.stepHeaderRow}>
            <View
              style={[
                styles.stepBadge,
                {
                  backgroundColor: 'rgba(232, 53, 42, 0.12)',
                  borderColor: 'rgba(232, 53, 42, 0.35)',
                },
              ]}
            >
              <Ionicons
                name={isMissionStep ? 'sparkles' : 'speedometer-outline'}
                size={12}
                color={loud.loud}
              />
              <Text style={[styles.stepBadgeText, { color: loud.loud }]}>
                {isMissionStep ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}
              </Text>
            </View>

            {isMissionStep ? (
              <Pressable
                onPress={() => {
                  thud('light');
                  setOnboardingStep('baseline');
                }}
                hitSlop={12}
                style={styles.actionLinkWrapper}
                accessibilityRole="button"
                accessibilityLabel="Skip to baseline metrics"
              >
                <Text style={[styles.skipLink, { color: colors.textMuted }]}>
                  SKIP TO STATS →
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  thud('light');
                  setOnboardingStep('mission');
                }}
                hitSlop={12}
                style={styles.actionLinkWrapper}
                accessibilityRole="button"
                accessibilityLabel="Back to mission focus"
              >
                <Text style={[styles.skipLink, { color: colors.accent }]}>
                  ← EDIT MISSION
                </Text>
              </Pressable>
            )}
          </View>

          {/* Integrated 2-Segment Progress Bar */}
          <View style={styles.progressBar}>
            <View style={[styles.progressSegment, { backgroundColor: loud.loud }]} />
            <View
              style={[
                styles.progressSegment,
                { backgroundColor: !isMissionStep ? loud.loud : colors.border },
              ]}
            />
          </View>

          {/* Title & Concise Subtitle */}
          <Text style={[styles.title, { color: colors.text }]}>
            {isMissionStep ? 'Choose your training mission' : 'Set your Day 1 baseline'}
          </Text>
          <Text style={[styles.desc, { color: colors.textMuted }]}>
            {isMissionStep
              ? 'Ascend personalizes your daily dashboard spotlight and coaching advice to match your mission.'
              : 'Your baseline seeds your initial expenditure model. Over your first 7 days, it learns your exact metabolic rate from your logs.'}
          </Text>

          {isMissionStep ? (
            <>
              {/* Compact Mission Picker without top praise clutter */}
              <View style={styles.missionPickerContainer}>
                <MissionPicker
                  compact
                  hidePraiseBox
                  selectedMission={selectedMission}
                  selectedSpotlight={selectedSpotlight}
                  onChangeMission={setSelectedMission}
                  onChangeSpotlight={setSelectedSpotlight}
                />
              </View>

              {/* Next Button */}
              <View style={styles.nextButtonWrapper}>
                <Button
                  label="NEXT: SET BASELINE STATS →"
                  onPress={() => {
                    thud('heavy');
                    setOnboardingStep('baseline');
                  }}
                />
              </View>
            </>
          ) : (
            <View style={styles.form}>
              {/* Unit System */}
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
                    label={`HEIGHT (${units === 'imperial' ? 'IN' : 'CM'})`}
                    value={heightStr}
                    onChangeText={setHeightStr}
                    keyboardType="numeric"
                    placeholder={units === 'imperial' ? '68' : '175'}
                    error={isHeightInvalid}
                  />
                </View>
                <View style={styles.col}>
                  <Field
                    label={`WEIGHT (${units === 'imperial' ? 'LB' : 'KG'})`}
                    value={weightStr}
                    onChangeText={setWeightStr}
                    keyboardType="numeric"
                    placeholder={units === 'imperial' ? '155' : '70'}
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

              {/* Finish CTA */}
              <View style={styles.finishButtonWrapper}>
                <Button
                  label="START ASCEND JOURNEY 🚀"
                  onPress={() => void handleSaveProfile()}
                />
              </View>
            </View>
          )}
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
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  stepBadgeText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  actionLinkWrapper: {
    paddingVertical: 4,
    paddingLeft: space.sm,
  },
  skipLink: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  progressBar: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.md,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
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
  missionPickerContainer: {
    marginTop: space.xs,
  },
  nextButtonWrapper: {
    marginTop: space.md,
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
