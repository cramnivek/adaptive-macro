import type { ActivityLevel, GoalDirection, Sex } from '@adaptive-macros/engine';
import { cmToInches, inchesToCm, kgToLb, lbToKg } from '@adaptive-macros/engine';
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
import { useSocial } from '../../src/social/session';
import { playChime, primeChime } from '../../src/platform/chime';
import type { AppSettings, WeightUnitSetting, SpeedUnitSetting, AppPersonality } from '../../src/state/settings';
import { useApp } from '../../src/state/AppStore';
import { font, radius, space, useTheme } from '../../src/theme';
import { HomeScreenNotice } from '../../src/components/HomeScreenNotice';
import { isPersonalityV2Enabled } from '../../src/flags';
import { getEventCopy } from '../../src/copy/personality';

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
  const { settings, updateSettings, refreshAll } = useApp();
  const social = useSocial();
  const metric = settings.units === 'metric';

  // Holds the label to show while a bulk write runs. Seeding four months is
  // hundreds of inserts, long enough that an unchanged button reads as a
  // no-op and invites a second tap.
  const [busy, setBusy] = useState<string | null>(null);

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
      notify('Restored', 'Close and reopen the app to load the restored data.');
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
            label="Activity (cold start only)"
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

        <Card title="Macros">
          <NumberSetting
            label="Protein"
            value={settings.proteinGPerKg}
            suffix="g per kg bodyweight"
            decimals={2}
            onCommit={(proteinGPerKg) => void updateSettings({ proteinGPerKg })}
            hint="1.6–2.2 g/kg is the range the evidence supports for holding lean mass in a deficit."
          />
          <NumberSetting
            label="Minimum fat"
            value={settings.minFatGPerKg}
            suffix="g per kg bodyweight"
            decimals={2}
            onCommit={(minFatGPerKg) => void updateSettings({ minFatGPerKg })}
          />
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
                { value: 'gymrat', label: 'Gymrat 🔥' },
              ]}
            />
            <Text style={[styles.note, { color: colors.textFaint, marginBottom: space.md }]}>
              {settings.personality === 'classic'
                ? 'Classic — Keep it clean, straightforward & quiet.'
                : settings.personality === 'gymrat'
                  ? 'Gymrat — FULL GYM ARC ENERGY. Big hype, unhinged celebrations & maximum encouragement.'
                  : 'Ascend (Recommended) — A little hype, a lot of personality. Modern, encouraging, and sharp.'}
            </Text>

            <View style={[styles.previewBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Text style={[styles.previewHeading, { color: colors.textFaint }]}>LIVE PREVIEW</Text>

              <View style={styles.previewRow}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Verified PR:</Text>
                <Text style={[styles.previewVal, { color: colors.accent }]}>
                  {getEventCopy('workout.pr_verified', { personality: settings.personality, seed: 1 })}
                </Text>
              </View>

              <View style={styles.previewRow}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Set Ticked:</Text>
                <Text style={[styles.previewVal, { color: colors.warning }]}>
                  {getEventCopy('workout.impact_done', { personality: settings.personality, seed: 1 })}
                </Text>
              </View>

              <View style={styles.previewRow}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Rest Timer:</Text>
                <Text style={[styles.previewVal, { color: colors.positive }]}>
                  {getEventCopy('workout.rest_done_label', { personality: settings.personality, seed: 1 })}
                </Text>
              </View>

              <View style={styles.previewRow}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Workout Done:</Text>
                <Text style={[styles.previewVal, { color: colors.text }]}>
                  {getEventCopy('workout.completed', { personality: settings.personality, seed: 1 })}
                </Text>
              </View>

              <View style={styles.previewRow}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Weekly Recap:</Text>
                <Text style={[styles.previewVal, { color: colors.textMuted }]}>
                  {getEventCopy('trends.weekly_recap_ready', { personality: settings.personality, seed: 1 })}
                </Text>
              </View>
            </View>
          </Card>
        </Section>
      )}

      <Section title="Units & Training">
        <Card title="Units">
          <Segmented<WeightUnitSetting>
            label="Weight unit"
            value={settings.weightUnitSetting ?? 'switchable'}
            onChange={(val) => {
              const patch: Partial<AppSettings> = { weightUnitSetting: val };
              if (val === 'kg') patch.units = 'metric';
              if (val === 'lbs') patch.units = 'imperial';
              void updateSettings(patch);
            }}
            options={[
              { value: 'switchable', label: 'Switchable' },
              { value: 'kg', label: 'kg' },
              { value: 'lbs', label: 'lbs' },
            ]}
          />
          <Text style={[styles.note, { color: colors.textFaint, marginBottom: space.md }]}>
            When set to Switchable, a KG / LBS toggle is available in your active workout sessions. Selecting kg or lbs locks the unit and hides the switcher.
          </Text>

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
          <Text style={[styles.note, { color: colors.textFaint }]}>
            When set to Switchable, a KPH / MPH toggle is available in your active workout sessions. Selecting kph or mph locks the unit and hides the switcher. Outside distance is measured in km.
          </Text>
        </Card>

        <Card title="Rest timer alert">
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
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Plays a chime every time the rest period finishes between sets. Can also be toggled directly in the session view.
          </Text>
        </Card>
      </Section>

      <Section title="Food & Estimation">
        <Card>
          <Field
            label="Food database country"
            value={settings.foodCountry}
            onChangeText={(foodCountry) => void updateSettings({ foodCountry })}
            placeholder="world"
            hint="A country code like ph, us, gb, jp — or 'world'. Searches local country products first, then global databases."
          />
        </Card>

        <Card title="Smart Food Search & Macro Estimation" subtitle="Automatic food recognition and restaurant menu lookup.">
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Works automatically with zero setup using the built-in hosted service. If you prefer to supply a custom API key for dedicated quota, enter it below.
          </Text>
          <Field
            label="Custom API key (optional)"
            value={settings.foodLookup.geminiApiKey}
            onChangeText={(geminiApiKey) =>
              void updateSettings({
                foodLookup: { ...settings.foodLookup, geminiApiKey },
              })
            }
            placeholder="AIza…"
            hint="Leave blank to use the built-in service."
          />
        </Card>
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
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Logging, routines and progression live on the Train tab.
          </Text>
        </Card>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  previewBox: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.xs,
    marginTop: space.xs,
  },
  previewHeading: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  previewLabel: {
    fontFamily: font.ui,
    fontSize: 11,
    minWidth: 88,
  },
  previewVal: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    flex: 1,
  },
});
