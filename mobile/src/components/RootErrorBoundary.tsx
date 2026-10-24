import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { exportBackup } from '../db';
import { saveTextFile } from '../platform/files';
import { releaseSplash } from '../platform/splash';
import { dark, font, radius, space } from '../theme';
import { TOUCH_TARGET } from './Controls';

interface State {
  error: Error | null;
  backupStatus: string | null;
}

/**
 * Last-resort error boundary wrapping the root provider tree.
 *
 * If any synchronous render or lifecycle error escapes a provider or screen
 * before `<AuthGate>` or `<StorageGate>` can release the native launch screen,
 * `componentDidCatch` releases it immediately so the app never hangs or force
 * closes silently. Uses static dark tokens so it depends on no context.
 */
export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, backupStatus: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      backupStatus: null,
    };
  }

  componentDidCatch(): void {
    releaseSplash();
  }

  private handleRetry = (): void => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      window.location.reload();
      return;
    }
    this.setState({ error: null, backupStatus: null });
  };

  private handleExportBackup = async (): Promise<void> => {
    try {
      this.setState({ backupStatus: 'Saving backup…' });
      const backup = await exportBackup();
      const stamp = new Date().toISOString().slice(0, 10);
      const how = await saveTextFile(
        `starke-backup-${stamp}.json`,
        JSON.stringify(backup, null, 2),
      );
      if (how === 'downloaded' || how === 'written') {
        this.setState({ backupStatus: 'Backup saved.' });
      } else {
        this.setState({ backupStatus: null });
      }
    } catch (err) {
      this.setState({
        backupStatus: `Could not export backup: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  render(): React.ReactNode {
    const { error, backupStatus } = this.state;
    if (error === null) return this.props.children;

    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Something went wrong.</Text>
        <Text style={styles.body}>
          Your logged food, weigh-ins and workouts on this device are untouched. You can try
          reopening the screen or save a backup file of your log right now.
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={this.handleRetry}
            accessibilityRole="button"
            style={[styles.button, styles.primaryButton]}
          >
            <Text style={styles.primaryLabel}>Try again</Text>
          </Pressable>
          <Pressable
            onPress={() => void this.handleExportBackup()}
            accessibilityRole="button"
            style={[styles.button, styles.secondaryButton]}
          >
            <Text style={styles.secondaryLabel}>Export backup</Text>
          </Pressable>
        </View>
        {backupStatus !== null && <Text style={styles.status}>{backupStatus}</Text>}
        <Text selectable style={styles.detail}>
          {error.name}: {error.message}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
    backgroundColor: dark.background,
  },
  title: {
    fontFamily: font.display,
    fontSize: 24,
    color: dark.text,
  },
  body: {
    fontFamily: font.ui,
    fontSize: 15,
    lineHeight: 22,
    color: dark.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  button: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: dark.accent,
  },
  primaryLabel: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    color: dark.onFill,
  },
  secondaryButton: {
    backgroundColor: dark.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: dark.border,
  },
  secondaryLabel: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    color: dark.text,
  },
  status: {
    fontFamily: font.ui,
    fontSize: 13,
    color: dark.textMuted,
  },
  detail: {
    fontFamily: font.figure,
    fontSize: 11,
    lineHeight: 16,
    color: dark.textFaint,
  },
});
