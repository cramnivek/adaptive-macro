import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { notify } from '../src/dialog';
import { acceptRequest, declineRequest, pendingRequests } from '../src/social/feed';
import { useSocial } from '../src/social/session';
import type { PublicProfile } from '../src/social/types';
import { font, radius, space, useTheme } from '../src/theme';

/**
 * People asking to follow you.
 *
 * Approving is what lets someone see a private account's posts, and this screen is the only
 * way in. Declining deletes the request.
 */
export default function RequestsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { configured, session, profile } = useSocial();
  const [requests, setRequests] = useState<PublicProfile[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The request being answered, so a second tap on its buttons can't send the same answer twice.
  const [answering, setAnswering] = useState<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setRequests(await pendingRequests());
    } catch (error) {
      setProblem((error as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session && profile) void load();
    }, [session, profile, load]),
  );

  const answer = async (person: PublicProfile, respond: (from: string) => Promise<void>) => {
    setAnswering(person.id);
    try {
      await respond(person.id);
      setRequests((current) => current?.filter((p) => p.id !== person.id) ?? null);
    } catch (error) {
      notify('Could not answer that', (error as Error).message);
    } finally {
      setAnswering(null);
    }
  };

  const say = (words: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{words}</Text>;

  if (!configured) return <Screen>{say('Social is not set up in this build.')}</Screen>;
  if (session === undefined || profile === undefined) return <Screen><ActivityIndicator color={colors.text} /></Screen>;
  if (session === null || profile === null) {
    return (
      <Screen>
        <Card>
          {say('Sign in and choose a username to see follow requests.')}
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
      ) : requests === null ? (
        <ActivityIndicator color={colors.text} />
      ) : requests.length === 0 ? (
        say('No follow requests.')
      ) : (
        requests.map((person) => (
          <View key={person.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Tappable
              onPress={() => router.push({ pathname: '/profile', params: { username: person.username } })}
              accessibilityRole="button"
              style={styles.who}
            >
              <Text style={[styles.name, { color: colors.text }]}>{person.display_name}</Text>
              <Text style={[styles.handle, { color: colors.textFaint }]}>@{person.username}</Text>
            </Tappable>
            <View style={styles.buttons}>
              <View style={styles.button}>
                <Button label="Approve" disabled={answering !== null} onPress={() => void answer(person, acceptRequest)} />
              </View>
              <View style={styles.button}>
                <Button label="Decline" variant="subtle" disabled={answering !== null} onPress={() => void answer(person, declineRequest)} />
              </View>
            </View>
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
    marginBottom: space.sm,
  },
  who: { minHeight: TOUCH_TARGET, justifyContent: 'center', marginBottom: space.sm },
  name: { fontFamily: font.uiStrong, fontSize: 15 },
  handle: { fontFamily: font.ui, fontSize: 13 },
  buttons: { flexDirection: 'row', gap: space.sm },
  button: { flex: 1 },
});
