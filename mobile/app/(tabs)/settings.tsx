import type { ActivityLevel, GoalDirection, Sex } from '@adaptive-macros/engine';
import { cmToInches, inchesToCm, kgToLb, lbToKg } from '@adaptive-macros/engine';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { exportBackup } from '../../src/db';
import { clearAllData, clearDemoData, seedDemoData } from '../../src/db/seed';
import { defaultOllamaHost, listOllamaModels } from '../../src/ai/ollama';
import { Card } from '../../src/components/Card';
import { Button, Field, Segmented } from '../../src/components/Controls';
import { Screen } from '../../src/components/Screen';
import { confirm, notify } from '../../src/dialog';
import { weightUnit } from '../../src/format';
import { useApp } from '../../src/state/AppStore';
import { space, useTheme } from '../../src/theme';

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
  const { settings, updateSettings, refreshAll } = useApp();
  const metric = settings.units === 'metric';

  // Holds the label to show while a bulk write runs. Seeding four months is
  // hundreds of inserts, long enough that an unchanged button reads as a
  // no-op and invites a second tap.
  const [busy, setBusy] = useState<string | null>(null);

  // Populated by an explicit connection check rather than on mount: probing a
  // local server the user may not be running would fail noisily on every visit
  // to this screen.
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [probing, setProbing] = useState<string | null>(null);

  // On a phone this resolves to the machine serving the bundle over the LAN;
  // in a browser it is loopback. Read fresh on every render so a changed dev
  // server address shows up without restarting the app.
  const detectedOllamaHost = defaultOllamaHost();

  const probeOllama = async () => {
    setProbing('Checking…');
    try {
      const models = await listOllamaModels(settings.ollamaHost);
      setOllamaModels(models);
      notify(
        models.length ? 'Ollama is reachable' : 'Ollama is reachable but has no models',
        models.length ? `Models: ${models.join(', ')}` : 'Pull one with: ollama pull qwen2.5:32b',
      );
      // Save a keystroke when there is only one sensible answer.
      if (models.length === 1 && !settings.ollamaModel) {
        void updateSettings({ ollamaModel: models[0] });
      }
    } catch (error) {
      notify('Could not reach Ollama', (error as Error).message);
    } finally {
      setProbing(null);
    }
  };

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
      const uri = `${FileSystem.cacheDirectory}adaptive-macros-backup.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(backup, null, 2));

      if (!(await Sharing.isAvailableAsync())) {
        notify('Export saved', `Written to ${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: 'Export your data',
      });
    } catch (error) {
      notify('Export failed', (error as Error).message);
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
          label="Food database country"
          value={settings.foodCountry}
          onChangeText={(foodCountry) => void updateSettings({ foodCountry })}
          placeholder="world"
          hint="A country code like ph, us, gb, jp — or 'world'. Open Food Facts keeps a separate view per country holding what is actually sold there, so local brands that are missing from the global view turn up in their own market's. Both are searched, local results first."
        />
        <Field
          label="USDA API key"
          value={settings.usdaApiKey}
          onChangeText={(usdaApiKey) => void updateSettings({ usdaApiKey })}
          hint="DEMO_KEY works but is rate limited to about 30 requests per hour. Free key at fdc.nal.usda.gov/api-key-signup.html"
        />
      </Card>

      <Card title="Describing meals" subtitle="Write a meal in words and get macros back.">
        <Segmented
          label="Estimated by"
          value={settings.aiProvider}
          onChange={(aiProvider) => void updateSettings({ aiProvider })}
          options={[
            { value: 'ollama' as const, label: 'Local model' },
            { value: 'anthropic' as const, label: 'Claude API' },
          ]}
        />

        {settings.aiProvider === 'ollama' ? (
          <>
            <Field
              label="Ollama address"
              value={settings.ollamaHost}
              onChangeText={(ollamaHost) => void updateSettings({ ollamaHost })}
              placeholder="http://127.0.0.1:11434"
            />
            {/*
              On a phone the right address is the dev machine's LAN IP, and that
              IP changes whenever its DHCP lease does — at which point the
              address saved here is silently stale. Offering the freshly
              detected one turns a confusing "could not reach Ollama" into one
              tap.
            */}
            {detectedOllamaHost !== settings.ollamaHost && (
              <Button
                label={`Use this session's computer (${detectedOllamaHost})`}
                variant="subtle"
                onPress={() => void updateSettings({ ollamaHost: detectedOllamaHost })}
              />
            )}
            <Field
              label="Model"
              value={settings.ollamaModel}
              onChangeText={(ollamaModel) => void updateSettings({ ollamaModel })}
              placeholder="qwen2.5:32b"
              hint={ollamaModels.length ? `On this server: ${ollamaModels.join(', ')}` : undefined}
            />
            <Button
              label={probing ?? 'Check connection'}
              variant="subtle"
              disabled={probing !== null}
              onPress={() => void probeOllama()}
            />
            <Text style={[styles.note, { color: colors.textFaint }]}>
              Runs entirely on your own machine. Nothing leaves it, there is no key and no cost. On this
              project's eval, qwen2.5:32b got every precisely-described meal right with a −2.5% calorie
              bias, and underestimated loosely-described ones like "fish and chips at the pub" — so weigh
              what you can, and check the numbers when you cannot.
            </Text>
            <Text style={[styles.note, { color: colors.textFaint }]}>
              In the browser, Ollama must be started with OLLAMA_ORIGINS set (for example
              OLLAMA_ORIGINS=* ) or it will refuse the request as cross-origin. Expect 10–45 seconds per
              estimate on a 32B model.
            </Text>
          </>
        ) : (
          <>
            <Field
              label="Anthropic API key"
              value={settings.anthropicApiKey}
              onChangeText={(anthropicApiKey) => void updateSettings({ anthropicApiKey })}
              placeholder="sk-ant-..."
            />
            <Text style={[styles.note, { color: colors.textFaint }]}>
              Requests go straight from this device to api.anthropic.com, billed to your own account. On
              Claude Opus 5 that is roughly one to four cents a meal. The screen shows what each estimate
              actually cost.
            </Text>
            <Text style={[styles.note, { color: colors.textFaint }]}>
              The key is stored unencrypted on this device, the same as the rest of your data, and is
              readable by anyone who can open this browser profile or phone.
            </Text>
          </>
        )}
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

      {__DEV__ && (
        <Card title="Demo data" subtitle="Development builds only — absent from a release build.">
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
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
