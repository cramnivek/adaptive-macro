import type { ActivityLevel, GoalDirection, Sex } from '@adaptive-macros/engine';
import { DEFAULT_TARGET_OPTIONS, cmToInches, inchesToCm, kgToLb, lbToKg } from '@adaptive-macros/engine';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  describeBackup,
  exportBackup,
  parseBackup,
  restoreBackup,
} from '../../src/db';
import { pickTextFile, saveTextFile } from '../../src/platform/files';
import { clearAllData, clearDemoData, seedDemoData } from '../../src/db/seed';
import { Card } from '../../src/components/Card';
import { Button, Field, Segmented, TOUCH_TARGET } from '../../src/components/Controls';
import { Screen } from '../../src/components/Screen';
import { confirm, notify } from '../../src/dialog';
import { weightUnit } from '../../src/format';
import { proteinExplanation } from '../../src/proteinCopy';
import { GoalPlanner, type GoalPlan } from '../../src/components/GoalPlanner';
import { useSocial } from '../../src/social/session';
import { playChime, playEffect, primeChime, primeEffect } from '../../src/platform/chime';
import type { AppSettings, WeightUnitSetting, SpeedUnitSetting, AppPersonality, UnitSystem } from '../../src/state/settings';
import { useApp } from '../../src/state/AppStore';
import { font, space, useTheme } from '../../src/theme';
import { HomeScreenNotice } from '../../src/components/HomeScreenNotice';
import { isPersonalityV2Enabled } from '../../src/flags';
import { MissionModal } from '../../src/components/MissionModal';
import { MISSIONS, SPOTLIGHT_OPTIONS } from '../../src/features/missionFocus';

/**
 * A numeric setting that edits as free text and only commits on blur.
 *
 * Committing on every keystroke makes "1.8" unreachable — the moment you type
 * "1." it parses as 1 and the field rewrites itself underneath you.
 */
const NumberSetting = ({
  label,
  value,
  onCommit,
  suffix,
  hint,
  decimals = 1,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  suffix?: string;
  hint?: string;
  decimals?: number;
}) => {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Field
      label={label}
      value={draft ?? String(Number(value.toFixed(decimals)))}
      onChangeText={setDraft}
      onBlurCommit={() => {
        if (draft === null) return;
        const parsed = Number.parseFloat(draft.replace(',', '.'));
        if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed);
        setDraft(null);
      }}
      keyboardType="decimal-pad"
      suffix={suffix}
      hint={hint}
    />
  );
};

/**
 * A settings group that stays shut until asked for.
 *
 * Twelve cards on one scroll meant hunting by thumb for a setting you already
 * knew the name of. Closed headings put the whole map on one screen.
 */
const Section = ({
  title,
  initiallyOpen = false,
  children,
}: {
  title: string;
  initiallyOpen?: boolean;
  children: React.ReactNode;
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <View style={{ marginBottom: space.md }}>
      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={({ pressed }) => [
          styles.sectionHeader,
          { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>
      {open && <View style={{ paddingTop: space.md }}>{children}</View>}
    </View>
  );
};

export default function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings, updateSettings, refreshAll, retryLoad, protein, proteinOverrideGPerKg, latest } = useApp();
  /** A goal weight and date not yet applied; applying it sets the direction and rate above. */
  const [plan, setPlan] = useState<GoalPlan | null>(null);
  const social = useSocial();
  const metric = settings.units === 'metric';

  // Holds the label to show while a bulk write runs. Seeding four months is
  // hundreds of inserts, long enough that an unchanged button reads as a
  // no-op and invites a second tap.
  const [busy, setBusy] = useState<string | null>(null);
  const [missionModalOpen, setMissionModalOpen] = useState(false);

  const runBulk = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    try {
      await work();
      await refreshAll();
    } catch (error) {
      notify('That did not work', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const loadDemo = () =>
    runBulk('Generating…', async () => {
      const days = await seedDemoData();
      notify('Demo history loaded', `${days} days of weigh-ins and meals added.`);
    });

  const removeDemo = () => runBulk('Removing…', clearDemoData);

  const confirmEraseAll = async () => {
    const ok = await confirm({
      title: 'Erase everything?',
      message:
        'Deletes every food log, weigh-in and cached food on this device. Your settings are kept. This cannot be undone.',
      confirmLabel: 'Erase',
      destructive: true,
    });
    if (ok) await runBulk('Erasing…', clearAllData);
  };

  const exportData = async () => {
    try {
      const backup = await exportBackup();
      const counts = describeBackup(backup);
      const stamp = new Date().toISOString().slice(0, 10);

      const how = await saveTextFile(
        `ascend-backup-${stamp}.json`,
        JSON.stringify(backup, null, 2),
      );

      if (how === 'downloaded' || how === 'written') {
        notify(
          'Backup saved',
          `${counts.weights} weigh-ins, ${counts.entries} diary entries, ` +
            `${counts.sessions} workouts and ${counts.sets} sets.`,
        );
      }
    } catch (error) {
      notify('Export failed', (error as Error).message);
    }
  };

  /**
   * Restores a backup over everything currently stored.
   *
   * Confirmed against what the file actually holds rather than a generic "are
   * you sure": the counts are the only way to notice you picked last month's
   * backup before it replaces this month's data.
   */
  const restoreData = async () => {
    try {
      const picked = await pickTextFile();
      if (!picked) return;

      const backup = parseBackup(picked.text);
      const counts = describeBackup(backup);

      const sure = await confirm({
        title: 'Replace everything?',
        message:
          `${picked.name} was exported on ${counts.exportedAt.slice(0, 10)} and holds ` +
          `${counts.weights} weigh-ins, ${counts.entries} diary entries, ` +
          `${counts.sessions} workouts and ${counts.sets} sets.\n\n` +
          'Everything currently on this device will be deleted and replaced.',
        confirmLabel: 'Replace',
        destructive: true,
      });
      if (!sure) return;

      await restoreBackup(backup);
      // The whole load again, settings included: the screens that read the
      // store kept showing what was there before, so weigh-ins looked lost
      // while workouts, read straight from the database, had come back.
      retryLoad();
      notify(
        'Restored',
        `${counts.weights} weigh-ins, ${counts.entries} diary entries, ` +
          `${counts.sessions} workouts and ${counts.sets} sets.`,
      );
    } catch (error) {
      notify('Restore failed', (error as Error).message);
    }
  };

  return (
    <Screen title="Settings">
      <HomeScreenNotice />
      <Section title="You" initiallyOpen>
        <Card>
          <Segmented<Sex>
            label="Sex"
            value={settings.profile.sex}
            onChange={(sex) => void updateSettings({ profile: { ...settings.profile, sex } })}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
          />
          <NumberSetting
            label="Age"
            value={settings.profile.age}
            decimals={0}
            suffix="years"
            onCommit={(age) => void updateSettings({ profile: { ...settings.profile, age } })}
          />
          <NumberSetting
            label="Height"
            value={metric ? settings.profile.heightCm : cmToInches(settings.profile.heightCm)}
            suffix={metric ? 'cm' : 'in'}
            onCommit={(height) =>
              void updateSettings({
                profile: { ...settings.profile, heightCm: metric ? height : inchesToCm(height) },
              })
            }
          />
          <Segmented<ActivityLevel>
            label="Activity"
            value={settings.activity}
            onChange={(activity) => void updateSettings({ activity })}
            options={[
              { value: 'sedentary', label: 'Low' },
              { value: 'light', label: 'Light' },
              { value: 'moderate', label: 'Mod' },
              { value: 'active', label: 'High' },
              { value: 'veryActive', label: 'Max' },
            ]}
          />
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Height, age and activity only seed the first estimate. Once you have a couple of weeks of data the
            app measures your expenditure instead of predicting it, and these stop mattering.
          </Text>
        </Card>
      </Section>

      <Section title="Goal">
        <Card>
          <Segmented<GoalDirection>
            label="Direction"
            value={settings.goal.direction}
            onChange={(direction) => void updateSettings({ goal: { ...settings.goal, direction } })}
            options={[
              { value: 'lose', label: 'Lose' },
              { value: 'maintain', label: 'Maintain' },
              { value: 'gain', label: 'Gain' },
            ]}
          />
          {settings.goal.direction !== 'maintain' && (
            <NumberSetting
              label="Rate"
              value={metric ? settings.goal.rateKgPerWeek : kgToLb(settings.goal.rateKgPerWeek)}
              suffix={`${weightUnit(settings.units)}/week`}
              decimals={2}
              onCommit={(rate) =>
                void updateSettings({
                  goal: { ...settings.goal, rateKgPerWeek: metric ? rate : lbToKg(rate) },
                })
              }
              hint="Capped at 25% below expenditure for loss, 20% above for gain."
            />
          )}
          <NumberSetting
            label="Goal weight (optional)"
            value={
              settings.goalWeightKg === null
                ? 0
                : metric
                  ? settings.goalWeightKg
                  : kgToLb(settings.goalWeightKg)
            }
            suffix={weightUnit(settings.units)}
            onCommit={(weight) =>
              void updateSettings({ goalWeightKg: metric ? weight : lbToKg(weight) })
            }
            hint="Used only to project a date on the Trends tab."
          />
        </Card>

        <Card title="Plan by a date" subtitle="Pick a goal weight and when, and the rate above is set for you.">
          <GoalPlanner
            key={settings.units}
            currentKg={latest?.trendWeightKg ?? null}
            units={settings.units}
            initialGoalKg={settings.goalWeightKg}
            onPlan={setPlan}
          />
          <Button
            label="Use this plan"
            variant="subtle"
            disabled={plan === null}
            onPress={() => {
              if (plan === null) return;
              void updateSettings({
                goal: { direction: plan.pace.direction, rateKgPerWeek: plan.pace.rateKgPerWeek },
                goalWeightKg: plan.goalWeightKg,
              });
              notify('Goal updated', 'Your targets now follow the new plan.');
            }}
          />
        </Card>

        <Card title="Macros">
          {/* Recommended from goal, activity, sex and body fat (engine/protein.ts),
              so it follows the person; a figure typed here replaces it until
              they go back to the recommendation. */}
          <Text style={[styles.proteinNote, { color: colors.textMuted }]}>
            {proteinOverrideGPerKg === null
              ? `Recommended: ${proteinExplanation(protein, settings.goal.direction, settings.activity, settings.units)}`
              : `Your own figure. The recommendation would be ${proteinExplanation(protein, settings.goal.direction, settings.activity, settings.units)}`}
          </Text>
          <NumberSetting
            label="Protein"
            value={proteinOverrideGPerKg ?? protein.gPerKgBodyWeight}
            suffix="g per kg bodyweight"
            decimals={2}
            onCommit={(proteinOverrideGPerKg) => void updateSettings({ proteinOverrideGPerKg })}
            hint="Change this only to set your own. Most people do best on the recommendation."
          />
          {proteinOverrideGPerKg !== null && (
            <Button
              label="Use the recommendation"
              variant="subtle"
              // The old fixed figure is reset too, or a changed one would come back.
              onPress={() =>
                void updateSettings({ proteinOverrideGPerKg: null, proteinGPerKg: DEFAULT_TARGET_OPTIONS.proteinGPerKg })
              }
            />
          )}
          <NumberSetting
            label="Minimum fat"
            value={settings.minFatGPerKg}
            suffix="g per kg bodyweight"
            decimals={2}
            onCommit={(minFatGPerKg) => void updateSettings({ minFatGPerKg })}
          />
        </Card>
      </Section>

      {/*
        Two lines and a button. The focus changes labels only and has left
        onboarding, so it does not need a card's worth of explanation here.
      */}
      <Section title="Focus & home screen">
        <Card>
          {(() => {
            const currentMission = MISSIONS[settings.userMission ?? 'hybrid'] ?? MISSIONS.hybrid;
            const currentSpotlight =
              SPOTLIGHT_OPTIONS.find((s) => s.id === (settings.dashboardSpotlight ?? 'balanced')) ??
              SPOTLIGHT_OPTIONS[0];
            return (
              <View style={styles.missionSummaryBox}>
                <View style={styles.focusLine}>
                  <Ionicons name={currentMission.icon} size={18} color={colors.text} />
                  <Text style={[styles.missionActiveName, { color: colors.text }]}>{currentMission.name}</Text>
                </View>
                <View style={styles.focusLine}>
                  <Ionicons name="home-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.spotlightLabel, { color: colors.textMuted }]}>
                    Today shows {currentSpotlight.label.toLowerCase()}
                  </Text>
                </View>
                <Button label="Change" onPress={() => setMissionModalOpen(true)} variant="subtle" />
              </View>
            );
          })()}
        </Card>
      </Section>

      {isPersonalityV2Enabled() && (
        <Section title="App Personality">
          <Card subtitle="How much gym energy should Ascend bring?">
            <Segmented<AppPersonality>
              label="Tone"
              value={settings.personality ?? 'ascend'}
              onChange={(personality) => void updateSettings({ personality })}
              options={[
                { value: 'classic', label: 'Classic' },
                { value: 'ascend', label: 'Ascend' },
                { value: 'gymrat', label: 'Gymrat' },
              ]}
            />
            <Text style={[styles.note, { color: colors.textFaint }]}>
              {settings.personality === 'classic'
                ? 'Classic — Keep it clean, straightforward & quiet.'
                : settings.personality === 'gymrat'
                  ? 'Gymrat — FULL GYM ARC ENERGY. Big hype, unhinged celebrations & maximum encouragement.'
                  : 'Ascend (Recommended) — A little hype, a lot of personality. Modern, encouraging, and sharp.'}
            </Text>

          </Card>
        </Section>
      )}

      <Section title="Check-ins">
        <Card subtitle="The day your week ends. Your coach reviews the week the day after.">
          <Segmented<string>
            label="Week ends on"
            value={String(settings.checkInWeekEndsOn)}
            onChange={(day) => void updateSettings({ checkInWeekEndsOn: Number(day) })}
            options={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, day) => ({ value: String(day), label }))}
          />
          <Text style={[styles.note, { color: colors.textFaint }]}>
            A week earns a check-in with food logged on 5 days and 3 weigh-ins. Changing the day starts the next week
            from it; check-ins you already have stay as they were.
          </Text>
        </Card>
      </Section>

      <Section title="Units & Training" initiallyOpen>
        <Card title="Units">
          <Segmented<UnitSystem>
            label="Body weight"
            value={settings.units}
            onChange={(units) => void updateSettings({ units })}
            options={[
              { value: 'metric', label: 'kg' },
              { value: 'imperial', label: 'lb' },
            ]}
          />

          <Segmented<UnitSystem>
            label="Lifting"
            value={settings.workoutUnits ?? 'metric'}
            onChange={(workoutUnits) => void updateSettings({ workoutUnits })}
            options={[
              { value: 'metric', label: 'kg' },
              { value: 'imperial', label: 'lb' },
            ]}
          />

          <Segmented<WeightUnitSetting>
            label="kg / lb switch in workouts"
            value={settings.weightUnitSetting ?? 'switchable'}
            onChange={(weightUnitSetting) => void updateSettings({ weightUnitSetting })}
            options={[
              { value: 'switchable', label: 'Show' },
              { value: 'kg', label: 'Lock kg' },
              { value: 'lbs', label: 'Lock lbs' },
            ]}
          />

          <Segmented<SpeedUnitSetting>
            label="Speed unit (treadmill)"
            value={settings.speedUnitSetting ?? 'switchable'}
            onChange={(val) => {
              const patch: Partial<AppSettings> = { speedUnitSetting: val };
              if (val === 'kph') patch.activeSpeedUnit = 'kph';
              if (val === 'mph') patch.activeSpeedUnit = 'mph';
              void updateSettings(patch);
            }}
            options={[
              { value: 'switchable', label: 'Switchable' },
              { value: 'kph', label: 'kph' },
              { value: 'mph', label: 'mph' },
            ]}
          />
        </Card>

        <Card title="Chime when rest ends">
          <Segmented
            value={settings.restSound ? 'on' : 'off'}
            onChange={(val) => {
              const on = val === 'on';
              if (on) {
                primeChime(settings.restChimeChoice ?? 'chime');
                playChime(settings.restChimeChoice ?? 'chime');
              }
              void updateSettings({ restSound: on });
            }}
            options={[
              { value: 'on' as const, label: 'Alert on' },
              { value: 'off' as const, label: 'Silent' },
            ]}
          />
        </Card>

        {/* Turning it on plays the sting, so the choice is made by ear. */}
        <Card title="Sounds for big moments" subtitle="A short sting when you set a PR">
          <Segmented
            value={settings.effectSounds ? 'on' : 'off'}
            onChange={(val) => {
              const on = val === 'on';
              if (on) {
                primeEffect('pr');
                playEffect('pr');
              }
              void updateSettings({ effectSounds: on });
            }}
            options={[
              { value: 'on' as const, label: 'On' },
              { value: 'off' as const, label: 'Off' },
            ]}
          />
        </Card>
      </Section>

      <Section title="Food">
        <Card>
          <Field
            label="Food database country"
            value={settings.foodCountry}
            onChangeText={(foodCountry) => void updateSettings({ foodCountry })}
            placeholder="world"
            hint="A country code like ph, us or gb, or 'world'. Products from there come first."
          />
        </Card>

        {/*
          A key of one's own is for developers; the built-in service needs
          none. Shown only to someone who already set one, so it can be cleared.
        */}
        {settings.foodLookup.geminiApiKey.trim() !== '' && (
          <Card title="Custom API key">
            <Field
              label="Gemini API key"
              value={settings.foodLookup.geminiApiKey}
              onChangeText={(geminiApiKey) =>
                void updateSettings({
                  foodLookup: { ...settings.foodLookup, geminiApiKey },
                })
              }
              placeholder="AIza…"
              hint="Clear it to go back to the built-in service."
            />
          </Card>
        )}
      </Section>

      {social.configured && (
        <Section title="Account">
          <Card
            subtitle={
              social.session === undefined
                ? 'Checking your account…'
                : social.session
                  ? social.profile
                    ? `Signed in as @${social.profile.username}`
                    : 'Signed in'
                  : 'Sign in to post workouts. Everything else works without an account.'
            }
          >
            {social.session !== undefined && (
              <Button label={social.session ? 'Open account' : 'Sign in'} onPress={() => router.push('/account')} />
            )}
          </Card>
        </Section>
      )}

      <Section title="Your data">
        <Card subtitle="Your log lives on this device. An account is optional.">
          <Button label="Save a backup" onPress={() => void exportData()} />
          <Button label="Restore from a backup" onPress={() => void restoreData()} variant="subtle" />
          <Button label="Redo your starting numbers" onPress={() => router.push('/onboard')} variant="subtle" />
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Your food, weight, workouts and settings are kept only on this device, so this file is your
            only copy of the log and your only way onto another device. It holds your weigh-ins, your diary
            and your whole lifting history. If you make an account, only what you post and your profile
            are kept on a server, and they are removed when you delete the account.
          </Text>
          {Platform.OS === 'web' && (
            <Text style={[styles.note, { color: colors.warning }]}>
              In a browser your data sits in storage the browser is allowed to clear — clearing site
              data, or Safari's rule about sites unused for seven days, takes it with no warning. Save a
              backup now, and again after anything you would mind losing.
            </Text>
          )}
        </Card>

        <Card title="Lifting history">
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Bring your training history over from Hevy. Export the CSV from Hevy's settings,
            then pick it here — you will see what it found before anything is saved, and
            importing the same file twice changes nothing.
          </Text>
          <Button label="Import from Hevy" onPress={() => router.push('/import-workouts')} />
        </Card>

        <Button label="Privacy policy" onPress={() => router.push('/privacy' as any)} variant="subtle" />
      </Section>

      {__DEV__ && (
        <Section title="Demo data">
          <Card subtitle="Development builds only — absent from a release build.">
            <Text style={[styles.note, { color: colors.textFaint, marginBottom: space.md }]}>
              Generates four months of synthetic weigh-ins and meals so the charts and the expenditure
              estimate have something to show before you have logged that long yourself. Expenditure drifts
              down across the period the way it does in a sustained deficit, and the scale gets skipped in
              places so the uncertainty band has gaps to widen over.
            </Text>
            <Button
              label={busy ?? 'Load demo history'}
              disabled={busy !== null}
              onPress={() => void loadDemo()}
            />
            <View style={{ height: space.sm }} />
            <Button
              label="Remove demo data"
              variant="subtle"
              disabled={busy !== null}
              onPress={() => void removeDemo()}
            />
            <View style={{ height: space.sm }} />
            <Button
              label="Erase everything"
              variant="danger"
              disabled={busy !== null}
              onPress={() => void confirmEraseAll()}
            />
          </Card>
        </Section>
      )}

      <MissionModal
        visible={missionModalOpen}
        onClose={() => setMissionModalOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  proteinNote: { fontFamily: font.ui, fontSize: 13, lineHeight: 19 },
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_TARGET,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontFamily: font.uiStrong, fontSize: 15 },
  missionSummaryBox: {
    gap: space.sm,
    marginTop: space.xs,
  },
  focusLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  missionActiveName: {
    fontFamily: font.uiStrong,
    fontSize: 14,
  },
  spotlightLabel: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
});
