import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { confirm, notify } from '../src/dialog';
import { blockedProfiles, unblock } from '../src/social/feed';
import { useSocial } from '../src/social/session';
import type { PublicProfile } from '../src/social/types';
import { font, radius, space, useTheme } from '../src/theme';

/**
 * The people you have blocked, and the only place to undo it.
 *
 * Each row shows what you could see of the person when you blocked them, so it is a name and a
 * username and nothing live: not a link to their profile, and no Instagram handle.
 */
export default function BlockedScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { configured, session, profile } = useSocial();
  const [blocked, setBlocked] = useState<PublicProfile[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The person being unblocked, so a second tap can't send the same request twice.
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setBlocked(await blockedProfiles());
    } catch (error) {
      setProblem((error as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session && profile) void load();
    }, [session, profile, load]),
  );

  const lift = async (person: PublicProfile) => {
    const sure = await confirm({
      title: `Unblock @${person.username}?`,
      message: 'They will be able to find you again, and you them. Neither of you will follow the other.',
      confirmLabel: 'Unblock',
    });
    if (!sure) return;
    setWorking(person.id);
    try {
      await unblock(person.id);
      setBlocked((current) => current?.filter((p) => p.id !== person.id) ?? null);
    } catch (error) {
      notify('Could not unblock them', (error as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const say = (words: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{words}</Text>;

  if (!configured) return <Screen>{say('Social is not set up in this build.')}</Screen>;
  if (session === undefined || profile === undefined) return <Screen><ActivityIndicator color={colors.text} /></Screen>;
  if (session === null || profile === null) {
    return (
      <Screen>
        <Card>
          {say('Sign in and choose a username to see who you have blocked.')}
          <Button label={session === null ? 'Sign in' : 'Choose a username'} onPress={() => router.push(session === null ? '/sign-in' : '/profile-setup')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      {problem !== null ? (
        <>
          {say(problem)}
          <Button label="Try again" onPress={() => void load()} />
        </>
      ) : blocked === null ? (
        <ActivityIndicator color={colors.text} />
      ) : blocked.length === 0 ? (
        say("You haven't blocked anyone.")
      ) : (
        blocked.map((person) => (
          <View key={person.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.who}>
              <Text style={[styles.name, { color: colors.text }]}>{person.display_name}</Text>
              <Text style={[styles.handle, { color: colors.textFaint }]}>@{person.username}</Text>
            </View>
            <Button label="Unblock" variant="subtle" disabled={working !== null} onPress={() => void lift(person)} />
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  row: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    marginBottom: space.sm,
  },
  who: { minHeight: TOUCH_TARGET, justifyContent: 'center', marginBottom: space.sm },
  name: { fontFamily: font.uiStrong, fontSize: 15 },
  handle: { fontFamily: font.ui, fontSize: 13 },
});
