import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { UserAvatar } from '../src/components/UserAvatar';
import { StepLogModal } from '../src/components/StepLogModal';
import { confirm, notify } from '../src/dialog';
import { deleteAccount, signOut } from '../src/social/api';
import { useSocial } from '../src/social/session';
import { loadHealthSyncConfig } from '../src/health/healthSync';
import type { HealthSyncConfig } from '../src/health/types';
import { todayISO } from '@adaptive-macros/engine';
import { font, radius, space, useTheme } from '../src/theme';
import { thud } from '../src/platform/haptics';

/** The account: who you are to other people, your posts, and the way out. */
export default function AccountScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { configured, session, profile, profileFailed, refreshProfile } = useSocial();
  const [busy, setBusy] = useState(false);
  const [healthConfig, setHealthConfig] = useState<HealthSyncConfig | null>(null);
  const [stepModalOpen, setStepModalOpen] = useState(false);

  useEffect(() => {
    void loadHealthSyncConfig().then(setHealthConfig);
  }, []);

  const leave = async (step: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await step();
    } catch (error) {
      notify(failure, (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const sure = await confirm({
      title: 'Delete your account?',
      message: 'Your profile and every post are removed from the server for good. Your log on this phone is not touched.',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (!sure) return;
    await leave(async () => {
      await deleteAccount();
      notify('Account deleted');
      router.back();
    }, 'Could not delete the account');
  };

  const handleForceReload = async () => {
    thud('heavy');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        if ('caches' in window) {
          const keys = await window.caches.keys();
          await Promise.all(keys.map((k) => window.caches.delete(k)));
        }
      } catch {}
      window.location.reload();
    } else {
      notify('App up to date', 'You are running the latest version of Ascend.');
    }
  };

  const note = (text: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{text}</Text>;

  let accountBody: React.ReactNode;
  if (!configured) {
    accountBody = <Card>{note('Sign-in is not set up in this build.')}</Card>;
  } else if (session === undefined) {
    accountBody = <ActivityIndicator color={colors.text} />;
  } else if (session === null) {
    accountBody = (
      <Card>
        {note('An account is only needed to post workouts. Everything else works without one.')}
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  } else if (profile === undefined && !profileFailed) {
    accountBody = <ActivityIndicator color={colors.text} />;
  } else if (profile === undefined) {
    accountBody = (
      <Card>
        {note('Could not load your profile.')}
        {/* A failed retry is recorded in profileFailed, so the error is not needed here. */}
        <Button label="Try again" onPress={() => void refreshProfile().catch(() => undefined)} />
      </Card>
    );
  } else if (profile === null) {
    accountBody = (
      <Card>
        {note('Choose a username to finish setting up.')}
        <Button label="Choose a username" onPress={() => router.push('/profile-setup')} />
      </Card>
    );
  } else {
    accountBody = (
      <>
        <Card>
          <View style={styles.profileHeader}>
            <UserAvatar
              avatarUrl={profile.avatar_url}
              username={profile.username}
              name={profile.display_name}
              size="lg"
              ring
            />
            <View style={styles.profileHeaderMeta}>
              <Text style={[styles.displayName, { color: colors.text }]}>{profile.display_name}</Text>
              <Text style={[styles.handle, { color: colors.textFaint }]}>@{profile.username}</Text>
              {profile.training_focus && (
                <View style={[styles.focusBadge, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <Ionicons name="barbell-outline" size={12} color={colors.accent} />
                  <Text style={[styles.focusBadgeText, { color: colors.text }]}>{profile.training_focus}</Text>
                </View>
              )}
            </View>
          </View>

          {profile.bio && <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text>}
          {profile.pr_highlight && note(`🏆 PRs: ${profile.pr_highlight}`)}
          {profile.instagram && note(`Instagram: @${profile.instagram}`)}
          {note(profile.is_private ? 'Private: only people you approve will see your posts.' : 'Public: anyone can see your posts.')}
          <Button label="Edit profile & avatar" onPress={() => router.push('/profile-setup')} />
          <Button label="Your posts" variant="subtle" onPress={() => router.push('/my-posts')} />
          <Button label="Blocked people" variant="subtle" onPress={() => router.push('/blocked')} />
        </Card>
        <Card>
          <Button label="Sign out" variant="subtle" disabled={busy} onPress={() => void leave(signOut, 'Could not sign out')} />
          <Button label="Delete account" variant="danger" disabled={busy} onPress={() => void remove()} />
        </Card>
      </>
    );
  }

  return (
    <Screen title="Account & Settings">
      {accountBody}

      {/* HealthKit / Health Connect & Steps Sync Card */}
      <Card>
        <View style={styles.healthHeader}>
          <Ionicons
            name={Platform.OS === 'ios' ? 'heart' : 'fitness'}
            size={22}
            color={colors.positive}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Health & Step Activity</Text>
            <Text style={[styles.subNote, { color: colors.textMuted }]}>
              {healthConfig?.enabled
                ? `Sync active (${healthConfig.provider}) · ${(healthConfig.dailyStepGoal || 10000).toLocaleString()} steps daily goal`
                : 'Connect Apple Health or log daily steps for NEAT metabolic tracking'}
            </Text>
          </View>
        </View>
        <Button
          label="Log Steps / Import Apple Health"
          variant="subtle"
          onPress={() => setStepModalOpen(true)}
        />
      </Card>

      {/* App Version & Immediate Reload / Cache Buster */}
      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>App & Updates</Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Ascend v0.1.0 · Build 2026.10.18 · Cloud Run Active
        </Text>
        <Button
          label="Check for Updates / Reload App"
          variant="subtle"
          onPress={() => void handleForceReload()}
        />
      </Card>

      <StepLogModal
        visible={stepModalOpen}
        onClose={() => setStepModalOpen(false)}
        date={todayISO()}
        onSaved={() => {
          void loadHealthSyncConfig().then(setHealthConfig);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  subNote: { fontFamily: font.ui, fontSize: 12, marginTop: 2 },
  sectionTitle: { fontFamily: font.uiStrong, fontSize: 16, marginBottom: 4 },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
  profileHeaderMeta: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontFamily: font.display,
    fontSize: 20,
    letterSpacing: -0.2,
  },
  handle: {
    fontFamily: font.ui,
    fontSize: 14,
  },
  focusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  focusBadgeText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
  },
  bio: {
    fontFamily: font.ui,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: space.sm,
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
});
