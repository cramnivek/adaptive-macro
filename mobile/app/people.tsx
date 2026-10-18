import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field, TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { searchProfiles } from '../src/social/feed';
import { useSocial } from '../src/social/session';
import type { PublicProfile } from '../src/social/types';
import { UserAvatar } from '../src/components/UserAvatar';
import { font, radius, space, useTheme } from '../src/theme';

/**
 * Find someone by username.
 *
 * Search is by username only, and only as a prefix: you have to know who you are looking for.
 * Suggestions, "people you may know" and browsing by name are how strangers and spam reach
 * people, and this feature is for following friends, not for being found by everyone.
 */
export default function PeopleScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { configured, session, profile } = useSocial();
  const [text, setText] = useState('');
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const query = text.trim().replace(/^@/, '');
  const signedIn = session != null && profile != null;

  // Waits for a pause in typing so one search runs per word, not per keystroke. The cleanup
  // also drops an answer to a search that has since been replaced, which would otherwise
  // arrive late and overwrite the results for what is on screen now.
  useEffect(() => {
    setProblem(null);
    if (!signedIn || query.length < 2) {
      setResults(null);
      return;
    }
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const found = await searchProfiles(query);
        if (current) setResults(found);
      } catch (error) {
        if (current) setProblem((error as Error).message);
      }
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, signedIn]);

  const say = (words: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{words}</Text>;

  if (!configured) return <Screen>{say('Social is not set up in this build.')}</Screen>;
  if (session === undefined || profile === undefined) return <Screen><ActivityIndicator color={colors.text} /></Screen>;
  if (session === null || profile === null) {
    return (
      <Screen>
        <Card>
          {say('Sign in and choose a username to find people.')}
          <Button label={session === null ? 'Sign in' : 'Choose a username'} onPress={() => router.push(session === null ? '/sign-in' : '/profile-setup')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Field label="Username" value={text} onChangeText={setText} autoCapitalize="none" autoCorrect={false} placeholder="@username" />
      {problem !== null
        ? say(problem)
        : query.length < 2
          ? say('Type at least two letters of a username.')
          : results === null
            ? <ActivityIndicator color={colors.text} />
            : results.length === 0
              ? say('No one by that name.')
              : results.map((person) => (
                  <Tappable
                    key={person.id}
                    onPress={() => router.push({ pathname: '/profile', params: { username: person.username } })}
                    accessibilityRole="button"
                    style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={styles.personRow}>
                      <UserAvatar
                        avatarUrl={person.avatar_url}
                        username={person.username}
                        name={person.display_name}
                        size="md"
                      />
                      <View style={styles.who}>
                        <View style={styles.nameRow}>
                          <Text style={[styles.name, { color: colors.text }]}>{person.display_name}</Text>
                          {person.training_focus ? (
                            <View style={[styles.focusPill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                              <Text style={[styles.focusPillText, { color: colors.accent }]}>
                                {person.training_focus}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.handle, { color: colors.textFaint }]}>@{person.username}</Text>
                      </View>
                    </View>
                    {person.is_private && <Text style={[styles.tag, { color: colors.textMuted }]}>Private</Text>}
                  </Tappable>
                ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  row: {
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.sm,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexShrink: 1,
  },
  who: { flexShrink: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: { fontFamily: font.uiStrong, fontSize: 15 },
  focusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  focusPillText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
  },
  handle: { fontFamily: font.ui, fontSize: 13 },
  tag: { fontFamily: font.ui, fontSize: 12, marginLeft: space.md },
});
