import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { confirm, notify } from '../src/dialog';
import { deleteAccount, signOut } from '../src/social/api';
import { useSocial } from '../src/social/session';
import { font, space, useTheme } from '../src/theme';

/** The account: who you are to other people, your posts, and the way out. */
export default function AccountScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { configured, session, profile, refreshProfile } = useSocial();
  const [busy, setBusy] = useState(false);

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

  const note = (text: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{text}</Text>;

  let body: React.ReactNode;
  if (!configured) {
    body = <Card>{note('Sign-in is not set up in this build.')}</Card>;
  } else if (session === undefined) {
    body = <ActivityIndicator color={colors.text} />;
  } else if (session === null) {
    body = (
      <Card>
        {note('An account is only needed to post workouts. Everything else works without one.')}
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  } else if (profile === undefined) {
    body = (
      <Card>
        {note('Could not load your profile.')}
        <Button label="Try again" onPress={() => void refreshProfile().catch(() => undefined)} />
      </Card>
    );
  } else if (profile === null) {
    body = (
      <Card>
        {note('Choose a username to finish setting up.')}
        <Button label="Choose a username" onPress={() => router.push('/profile-setup')} />
      </Card>
    );
  } else {
    body = (
      <>
        <Card title={`@${profile.username}`} subtitle={profile.display_name}>
          {profile.instagram && note(`Instagram: @${profile.instagram}`)}
          {note(profile.is_private ? 'Private: only people you approve will see your posts.' : 'Public: anyone will be able to see your posts.')}
          <Button label="Edit profile" onPress={() => router.push('/profile-setup')} />
          <Button label="Your posts" variant="subtle" onPress={() => router.push('/my-posts')} />
        </Card>
        <Card>
          <Button label="Sign out" variant="subtle" disabled={busy} onPress={() => void leave(signOut, 'Could not sign out')} />
          <Button label="Delete account" variant="danger" disabled={busy} onPress={() => void remove()} />
        </Card>
      </>
    );
  }

  return <Screen>{body}</Screen>;
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
});
