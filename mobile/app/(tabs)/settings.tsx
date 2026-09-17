import type { ActivityLevel, GoalDirection, Sex } from '@adaptive-macros/engine';
import { cmToInches, inchesToCm, kgToLb, lbToKg } from '@adaptive-macros/engine';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { exportBackup } from '../../src/db';
import { Card } from '../../src/components/Card';
import { Button, Field, Segmented } from '../../src/components/Controls';
import { Screen } from '../../src/components/Screen';
import { weightUnit } from '../../src/format';
import { useApp } from '../../src/state/AppStore';
import { useTheme } from '../../src/theme';

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

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { settings, updateSettings } = useApp();
  const metric = settings.units === 'metric';

  const exportData = async () => {
    try {
      const backup = await exportBackup();
      const uri = `${FileSystem.cacheDirectory}adaptive-macros-backup.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(backup, null, 2));

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Export saved', `Written to ${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: 'Export your data',
      });
    } catch (error) {
      Alert.alert('Export failed', (error as Error).message);
    }
  };

  return (
    <Screen title="Settings">
      <Card title="You">
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

      <Card title="Goal">
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

      <Card title="Units">
        <Segmented
          value={settings.units}
          onChange={(units) => void updateSettings({ units })}
          options={[
            { value: 'metric' as const, label: 'kg / cm' },
            { value: 'imperial' as const, label: 'lb / in' },
          ]}
        />
      </Card>

      <Card title="Food data">
        <Field
          label="USDA API key"
          value={settings.usdaApiKey}
          onChangeText={(usdaApiKey) => void updateSettings({ usdaApiKey })}
          hint="DEMO_KEY works but is rate limited to about 30 requests per hour. Free key at fdc.nal.usda.gov/api-key-signup.html"
        />
      </Card>

      <Card
        title="Model tuning"
        subtitle="Defaults are sensible. Change these only if you know why you are changing them."
      >
        <NumberSetting
          label="Scale noise"
          value={settings.scaleNoiseKg}
          suffix="kg"
          decimals={2}
          onCommit={(scaleNoiseKg) => void updateSettings({ scaleNoiseKg })}
          hint="How much a single reading swings around your true trend. Raise it if you weigh inconsistently."
        />
        <NumberSetting
          label="Expenditure volatility"
          value={settings.expenditureVolatilityKcal}
          suffix="kcal/day"
          decimals={0}
          onCommit={(expenditureVolatilityKcal) => void updateSettings({ expenditureVolatilityKcal })}
          hint="How fast the estimate is allowed to chase new evidence. Higher adapts sooner but wobbles more."
        />
        <NumberSetting
          label="Energy per kg of tissue"
          value={settings.kcalPerKgTissue}
          suffix="kcal/kg"
          decimals={0}
          onCommit={(kcalPerKgTissue) => void updateSettings({ kcalPerKgTissue })}
          hint="7700 assumes the weight you lose or gain is mostly fat."
        />
      </Card>

      <Card title="Your data" subtitle="Everything lives on this device and nowhere else.">
        <Button label="Export backup (JSON)" onPress={() => void exportData()} variant="subtle" />
        <Text style={[styles.note, { color: colors.textFaint }]}>
          There is no server behind this app, so this file is your only backup and your only way onto a new
          phone. Keep one somewhere safe.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
