import type { ActivityLevel, GoalDirection, Sex } from '@adaptive-macros/engine';
import { paceForGoal, todayISO } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPOTLIGHT_OPTIONS } from '../features/missionFocus';
import { connectHealthConnect, syncHealthConnect } from '../health/healthConnect';
import { onboardingSteps, ONBOARDING_VERSION, type OnboardingStep } from '../onboardingSteps';
import { thud } from '../platform/haptics';
import { pushBaselineToCloud } from '../social/baselineSync';
import { useApp } from '../state/AppStore';
import { withDefaults, type AppPersonality, type DashboardSpotlight, type UnitSystem } from '../state/settings';
import { font, radius, space, useTheme } from '../theme';
import { ease, useReduceMotion } from '../theme/motion';
import { Button, Field, TOUCH_TARGET } from './Controls';
import { GoalPlanner, type GoalPlan } from './GoalPlanner';
import { Tappable } from './Tappable';

/**
 * First run, one question a screen.
 *
 * It was a single form on a card, and the choices that shape the app sat in
 * Settings, so they read as optional extras and mostly went unmade. Each now
 * gets the whole screen: a progress bar, Back, and no Skip, because these are
 * the app's settings, not a survey. Health Connect alone can be put off, since
 * a permission must always be optional. Which screens appear is decided in
 * onboardingSteps.ts; someone already set up sees only the new ones.
 *
 * Motion: each step slides a little and fades in from the side it came from
 * (occasional, so a standard entrance; transform and opacity only, on the
 * native driver), the progress bar eases along, and each choice gives a light
 * haptic with its highlight. With reduce motion on, steps only fade.
 */

const GOALS: { id: GoalDirection; title: string; line: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'lose', title: 'Lose fat', line: 'Eat a little under what you burn, and keep your strength.', icon: 'trending-down' },
  { id: 'maintain', title: 'Stay where I am', line: 'Hold your weight while you train and eat well.', icon: 'remove' },
  { id: 'gain', title: 'Build muscle', line: 'Eat a little over, lift progressively, gain slowly.', icon: 'trending-up' },
];

const ACTIVITY: { id: ActivityLevel; title: string; line: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'sedentary', title: 'Mostly sitting', line: 'Desk job, not much walking.', icon: 'desktop-outline' },
  { id: 'light', title: 'Lightly active', line: 'Some walking, or 1 to 3 workouts a week.', icon: 'walk-outline' },
  { id: 'moderate', title: 'Moderately active', line: 'On your feet a lot, or 3 to 5 workouts a week.', icon: 'bicycle-outline' },
  { id: 'active', title: 'Very active', line: 'A physical job, or training most days.', icon: 'barbell-outline' },
  { id: 'veryActive', title: 'Extremely active', line: 'Hard training twice a day, or heavy manual work.', icon: 'flame-outline' },
];

const SPOTLIGHT_ICONS: Record<DashboardSpotlight, keyof typeof Ionicons.glyphMap> = {
  balanced: 'grid-outline',
  workouts: 'barbell-outline',
  nutrition: 'restaurant-outline',
};

/** A real line in each voice, so the choice is heard rather than described. */
const VOICES: { id: AppPersonality; title: string; sample: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'classic', title: 'Classic', sample: '"Down 0.4 kg at 1,850 kcal a day. On track; keep it steady."', icon: 'reader-outline' },
  { id: 'ascend', title: 'Ascend', sample: '"Nice week! Down 0.4 kg, right where we want you. Keep it going."', icon: 'sparkles-outline' },
  { id: 'gymrat', title: 'Gym rat', sample: '"We are SO back 🔥 −0.4 kg and the bench is climbing. Locked in."', icon: 'flame-outline' },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TITLES: Record<OnboardingStep, { title: string; line: string }> = {
  goal: { title: 'What are you here for?', line: 'This sets your first calorie target. You can change it any time.' },
  body: { title: 'A few numbers about you', line: 'Your starting point. After a week or two of logging, your own data takes over.' },
  activity: { title: 'How active is a normal day?', line: 'Outside the gym. Workouts are counted from what you log.' },
  plan: { title: 'Where, and by when?', line: 'A target weight and a date set a pace you can hold. Leave it to go at a steady default.' },
  focus: { title: 'What should Today lead with?', line: 'The order of your home screen. Everything is still there whichever you pick.' },
  voice: { title: 'How should your coach talk?', line: 'The weekly check-ins and the app’s own words, in the voice you like.' },
  checkin: { title: 'When is your check-in day?', line: 'Your week ends on this day, and your coach reviews it the day after.' },
  health: { title: 'Bring in steps and weigh-ins', line: 'From Health Connect, where Garmin Connect and other apps share theirs. Read only; it stays on this phone.' },
  ready: { title: 'You are set', line: '' },
};

const OptionCard = ({
  selected,
  title,
  line,
  icon,
  onPress,
}: {
  selected: boolean;
  title: string;
  line: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) => {
  const { colors } = useTheme();
  return (
    <Tappable
      onPress={() => {
        thud('light');
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${line}`}
      style={[
        styles.option,
        { backgroundColor: colors.surface, borderColor: selected ? colors.accent : colors.border },
        selected && styles.optionSelected,
      ]}
    >
      <View style={[styles.optionIcon, { backgroundColor: selected ? colors.accent : colors.surfaceRaised }]}>
        <Ionicons name={icon} size={20} color={selected ? colors.onFill : colors.text} />
      </View>
      <View style={styles.optionText}>
        <Text style={[styles.optionTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.optionLine, { color: colors.textMuted }]}>{line}</Text>
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? colors.accent : colors.border}
      />
    </Tappable>
  );
};

/** The first targets counting up into place: the one celebration in first run. */
const CountUp = ({ to, suffix }: { to: number; suffix: string }) => {
  const reduceMotion = useReduceMotion();
  const value = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(reduceMotion ? to : 0);
  useEffect(() => {
    if (reduceMotion) {
      setShown(to);
      return;
    }
    const id = value.addListener(({ value: v }) => setShown(Math.round(v)));
    const animation = Animated.timing(value, { toValue: to, duration: 900, easing: ease, useNativeDriver: false });
    animation.start();
    return () => {
      animation.stop();
      value.removeListener(id);
    };
  }, [to, value, reduceMotion]);
  return <>{`${shown.toLocaleString()}${suffix}`}</>;
};

export const OnboardingFlow = ({ onComplete }: { onComplete: () => void }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { settings, updateSettings, recordWeight, program } = useApp();

  // The draft, kept until the last question so Back never half-saves anything.
  // Unchosen until chosen on first run. The stored defaults are fallbacks for
  // the type, and preselecting them made one person's answers everyone's:
  // tapping through accepted male, 30, 178 cm, moderately active, losing fat.
  // Someone already set up starts from their own answers instead.
  const own = settings.onboarded;
  const [goalDir, setGoalDir] = useState<GoalDirection | null>(own ? settings.goal.direction : null);
  const [sex, setSex] = useState<Sex | null>(own ? settings.profile.sex : null);
  const [ageStr, setAgeStr] = useState(own ? String(settings.profile.age) : '');
  const [heightStr, setHeightStr] = useState(
    own ? String(settings.units === 'imperial' ? Math.round(settings.profile.heightCm / 2.54) : settings.profile.heightCm) : '',
  );
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>(settings.units === 'imperial' ? 'in' : 'cm');
  const [weightStr, setWeightStr] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>(settings.units === 'imperial' ? 'lb' : 'kg');
  const [activity, setActivity] = useState<ActivityLevel | null>(own ? settings.activity : null);
  const [plan, setPlan] = useState<GoalPlan | null>(null);
  const [spotlight, setSpotlight] = useState<DashboardSpotlight>(settings.dashboardSpotlight ?? 'balanced');
  const [voice, setVoice] = useState<AppPersonality>(settings.personality);
  const [weekEndsOn, setWeekEndsOn] = useState(settings.checkInWeekEndsOn);
  const [healthNote, setHealthNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fixed when the flow opens: the steps someone is asked must not change
  // under them because a setting saved part-way through.
  const firstRun = useRef({ onboarded: settings.onboarded, completedVersion: settings.onboardingVersion }).current;
  const steps = useMemo(
    () => onboardingSteps({ ...firstRun, goal: goalDir ?? 'lose', android: Platform.OS === 'android' }),
    [firstRun, goalDir],
  );
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)];

  const parsedAge = Math.round(Number.parseFloat(ageStr));
  const parsedHeight = Number.parseFloat(heightStr.replace(',', '.'));
  const parsedWeight = Number.parseFloat(weightStr.replace(',', '.'));
  // Someone already set up may leave today's weight empty: a weigh-in is
  // logged only when one is given, never filled in from an old one.
  const weightValid = parsedWeight > 0 || (firstRun.onboarded && weightStr.trim() === '');
  const bodyValid =
    sex !== null && Number.isFinite(parsedAge) && parsedAge >= 13 && parsedAge <= 100 && parsedHeight > 0 && weightValid;
  const currentKg = parsedWeight > 0 ? (weightUnit === 'lb' ? parsedWeight / 2.20462 : parsedWeight) : null;

  // Entrance for each step, from the side it was reached from.
  const enter = useRef(new Animated.Value(1)).current;
  const direction = useRef(1);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 260, easing: ease, useNativeDriver: true }).start();
    Animated.timing(progress, {
      toValue: (index + 1) / steps.length,
      duration: 300,
      easing: ease,
      useNativeDriver: false,
    }).start();
  }, [index, steps.length, enter, progress]);

  const go = (delta: number) => {
    direction.current = delta;
    setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + delta)));
  };

  /** Everything chosen, saved at once as the last question is answered. */
  const commit = async () => {
    const choices = {
      dashboardSpotlight: spotlight,
      personality: voice,
      checkInWeekEndsOn: weekEndsOn,
      onboardingVersion: ONBOARDING_VERSION,
    };
    const weightKg = Math.round((currentKg ?? 0) * 100) / 100;
    const heightCm = Math.round(heightUnit === 'in' ? parsedHeight * 2.54 : parsedHeight);
    // Continue is off until each is chosen, so these are always set by now.
    const chosenSex = sex ?? settings.profile.sex;
    const chosenGoal = goalDir ?? settings.goal.direction;
    const chosenActivity = activity ?? settings.activity;
    if (firstRun.onboarded) {
      // Confirmed or corrected; today's weight only when one was given.
      if (weightKg > 0) await recordWeight(todayISO(), weightKg);
      await updateSettings({ ...choices, profile: { ...settings.profile, sex: chosenSex, age: parsedAge, heightCm } });
      return;
    }
    const units: UnitSystem = weightUnit === 'lb' ? 'imperial' : 'metric';
    // A goal weight and date set the rate; the numbers decide the direction, so
    // a goal above today's weight is a gain whichever card was picked.
    const pace = plan !== null ? paceForGoal(weightKg, plan.goalWeightKg, plan.weeks) : null;
    const patch = {
      ...choices,
      onboarded: true,
      missionOnboardingDismissed: true,
      featureOnboardingDismissed: true,
      units,
      workoutUnits: units,
      activity: chosenActivity,
      profile: { ...settings.profile, sex: chosenSex, age: parsedAge, heightCm },
      goal:
        chosenGoal !== 'maintain' && pace !== null
          ? { direction: pace.direction, rateKgPerWeek: pace.rateKgPerWeek }
          : { direction: chosenGoal, rateKgPerWeek: chosenGoal === 'maintain' ? 0 : chosenGoal === 'gain' ? 0.25 : 0.5 },
      goalWeightKg:
        chosenGoal === 'maintain' ? weightKg : plan !== null ? Math.round(plan.goalWeightKg * 100) / 100 : null,
    };
    await recordWeight(todayISO(), weightKg);
    await updateSettings(patch);
    void pushBaselineToCloud(withDefaults({ ...settings, ...patch }), weightKg);
  };

  const next = async () => {
    if (step === 'ready') {
      thud('heavy');
      onComplete();
      return;
    }
    if (steps[index + 1] === 'ready') {
      setBusy(true);
      try {
        await commit();
      } finally {
        setBusy(false);
      }
    }
    thud('light');
    go(1);
  };

  const connectHealth = async () => {
    setBusy(true);
    try {
      if (await connectHealthConnect()) {
        const result = await syncHealthConnect();
        setHealthNote(
          `Connected. Brought in ${result.weighIns} weigh-ins and ${result.stepDays} days of steps.`,
        );
      } else {
        setHealthNote('Not connected. You can connect any time from Account.');
      }
    } catch {
      setHealthNote('Health Connect is not available on this phone. You can still log by hand.');
    } finally {
      setBusy(false);
    }
  };

  const canContinue =
    step === 'body' ? bodyValid : step === 'goal' ? goalDir !== null : step === 'activity' ? activity !== null : true;
  // Someone already set up is asked to confirm their numbers, not enter them.
  const { title, line } =
    step === 'body' && firstRun.onboarded
      ? { title: 'Are these still right?', line: 'Age and height set your starting estimate. Add today’s weight if you have weighed in, or leave it empty.' }
      : TITLES[step];
  const slide = reduceMotion ? 0 : 24 * direction.current;

  const body = (() => {
    switch (step) {
      case 'goal':
        return GOALS.map((g) => (
          <OptionCard key={g.id} {...g} selected={goalDir === g.id} onPress={() => setGoalDir(g.id)} />
        ));
      case 'body':
        return (
          <View style={styles.form}>
            {/* Two pills rather than a segmented control, which always has one
                side on: here neither is, until it is chosen. */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>BIOLOGICAL SEX</Text>
            <View style={styles.days}>
              {(['female', 'male'] as const).map((option) => {
                const on = sex === option;
                return (
                  <Tappable
                    key={option}
                    onPress={() => {
                      thud('light');
                      setSex(option);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[
                      styles.day,
                      styles.sexPill,
                      { backgroundColor: on ? colors.accent : colors.surface, borderColor: on ? colors.accent : colors.border },
                    ]}
                  >
                    <Text style={[styles.dayText, { color: on ? colors.onFill : colors.text }]}>
                      {option === 'female' ? 'Female' : 'Male'}
                    </Text>
                  </Tappable>
                );
              })}
            </View>
            <Field label="AGE" value={ageStr} onChangeText={setAgeStr} keyboardType="numeric" placeholder="28" />
            <Field
              label={`HEIGHT (${heightUnit.toUpperCase()})`}
              labelRight={<Ionicons name="swap-horizontal" size={13} color={colors.accent} />}
              onPressLabel={() => {
                setHeightUnit((u) => (u === 'cm' ? 'in' : 'cm'));
                setHeightStr('');
              }}
              value={heightStr}
              onChangeText={setHeightStr}
              keyboardType="numeric"
              placeholder={heightUnit === 'in' ? '68' : '175'}
            />
            <Field
              label={`WEIGHT TODAY (${weightUnit.toUpperCase()})${firstRun.onboarded ? ', OPTIONAL' : ''}`}
              labelRight={<Ionicons name="swap-horizontal" size={13} color={colors.accent} />}
              onPressLabel={() => {
                setWeightUnit((u) => (u === 'kg' ? 'lb' : 'kg'));
                setWeightStr('');
              }}
              value={weightStr}
              onChangeText={setWeightStr}
              keyboardType="decimal-pad"
              placeholder={weightUnit === 'lb' ? '155' : '70'}
            />
          </View>
        );
      case 'activity':
        return ACTIVITY.map((a) => (
          <OptionCard key={a.id} {...a} selected={activity === a.id} onPress={() => setActivity(a.id)} />
        ));
      case 'plan':
        return (
          <GoalPlanner
            key={weightUnit}
            currentKg={currentKg}
            units={weightUnit === 'lb' ? 'imperial' : 'metric'}
            initialGoalKg={null}
            onPlan={setPlan}
          />
        );
      case 'focus':
        return SPOTLIGHT_OPTIONS.map((o) => (
          <OptionCard
            key={o.id}
            title={o.label}
            line={o.description}
            icon={SPOTLIGHT_ICONS[o.id]}
            selected={spotlight === o.id}
            onPress={() => setSpotlight(o.id)}
          />
        ));
      case 'voice':
        return VOICES.map((v) => (
          <OptionCard
            key={v.id}
            title={v.title}
            line={v.sample}
            icon={v.icon}
            selected={voice === v.id}
            onPress={() => setVoice(v.id)}
          />
        ));
      case 'checkin':
        return (
          <View style={styles.form}>
            <View style={styles.days}>
              {WEEKDAYS.map((day, weekday) => {
                const on = weekday === weekEndsOn;
                return (
                  <Tappable
                    key={day}
                    onPress={() => {
                      thud('light');
                      setWeekEndsOn(weekday);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={WEEKDAY_NAMES[weekday]}
                    style={[
                      styles.day,
                      { backgroundColor: on ? colors.accent : colors.surface, borderColor: on ? colors.accent : colors.border },
                    ]}
                  >
                    <Text style={[styles.dayText, { color: on ? colors.onFill : colors.text }]}>{day}</Text>
                  </Tappable>
                );
              })}
            </View>
            <Text style={[styles.note, { color: colors.textMuted }]}>
              {`Your week runs ${WEEKDAY_NAMES[(weekEndsOn + 1) % 7]} to ${WEEKDAY_NAMES[weekEndsOn]}. A week earns a check-in with food logged on 5 days and 3 weigh-ins.`}
            </Text>
          </View>
        );
      case 'health':
        return (
          <View style={styles.form}>
            <View style={[styles.healthCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="fitness-outline" size={28} color={colors.accent} />
              <Text style={[styles.note, { color: colors.textMuted }]}>
                Steps, and weigh-ins from a smart scale, arrive by themselves. Weigh-ins you enter yourself are never
                replaced.
              </Text>
              <Button
                label={busy ? 'Connecting…' : 'Connect Health Connect'}
                onPress={() => void connectHealth()}
                disabled={busy || healthNote?.startsWith('Connected') === true}
              />
            </View>
            {healthNote && <Text style={[styles.note, { color: colors.text }]}>{healthNote}</Text>}
          </View>
        );
      case 'ready':
        return (
          <View style={styles.ready}>
            <Text style={[styles.readyLabel, { color: colors.textMuted }]}>YOUR DAILY TARGET</Text>
            <Text style={[styles.readyFigure, { color: colors.text }]}>
              <CountUp to={Math.round(program.calories.kcal)} suffix=" kcal" />
            </Text>
            <Text style={[styles.readyMacro, { color: colors.textMuted }]}>
              <CountUp to={Math.round(program.macros.proteinG)} suffix=" g protein" />
            </Text>
            <Text style={[styles.note, { color: colors.textMuted }]}>
              A starting point from a formula. Log your food and weigh in, and within a couple of weeks it is worked
              out from your own numbers instead.
            </Text>
          </View>
        );
    }
  })();

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + space.sm }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.top}>
        {index > 0 && step !== 'ready' ? (
          <Tappable onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Tappable>
        ) : (
          <View style={styles.back} />
        )}
        <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: colors.accent,
                width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        </View>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View
          key={step}
          style={{
            opacity: enter,
            transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [slide, 0] }) }],
          }}
        >
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {line !== '' && <Text style={[styles.line, { color: colors.textMuted }]}>{line}</Text>}
          <View style={styles.options}>{body}</View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        {step === 'body' && !bodyValid && (ageStr || heightStr || weightStr) !== '' && (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Age 13 to 100, plus your height and today’s weight.
          </Text>
        )}
        <Button
          label={step === 'ready' ? 'Start' : step === 'health' && !healthNote ? 'Not now' : 'Continue'}
          onPress={() => void next()}
          disabled={!canContinue || busy}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  back: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  // The fill is absolute and childless, so its width can move without laying
  // anything else out again.
  track: { flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xl, maxWidth: 520, width: '100%', alignSelf: 'center' },
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  line: { fontFamily: font.ui, fontSize: 15, lineHeight: 21, marginTop: space.sm },
  options: { gap: space.md, marginTop: space.xl },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    minHeight: 76,
  },
  optionSelected: { borderWidth: 2 },
  optionIcon: { width: 40, height: 40, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontFamily: font.uiStrong, fontSize: 17 },
  optionLine: { fontFamily: font.ui, fontSize: 13, lineHeight: 18 },
  form: { gap: space.md },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  day: {
    minWidth: TOUCH_TARGET + 12,
    minHeight: TOUCH_TARGET + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  dayText: { fontFamily: font.uiStrong, fontSize: 15 },
  sexPill: { flex: 1 },
  fieldLabel: { fontFamily: font.display, fontSize: 11, letterSpacing: 1, marginBottom: -space.xs },
  note: { fontFamily: font.ui, fontSize: 14, lineHeight: 20 },
  healthCard: { gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1 },
  ready: { gap: space.sm, alignItems: 'flex-start' },
  readyLabel: { fontFamily: font.display, fontSize: 12, letterSpacing: 1.2 },
  readyFigure: { fontFamily: font.display, fontSize: 52, lineHeight: 58, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  readyMacro: { fontFamily: font.uiStrong, fontSize: 20, fontVariant: ['tabular-nums'], marginBottom: space.md },
  bottom: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm, maxWidth: 520, width: '100%', alignSelf: 'center' },
  hint: { fontFamily: font.ui, fontSize: 13, textAlign: 'center' },
});
