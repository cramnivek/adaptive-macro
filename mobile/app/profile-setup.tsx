import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field, Segmented } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { saveProfile } from '../src/social/api';
import { normaliseProfile, profileProblem } from '../src/social/profileRules';
import { useSocial } from '../src/social/session';
import { font, space, useTheme } from '../src/theme';

type Visibility = 'private' | 'public';

/**
 * Choosing a username on first sign-in, and editing the profile after.
 *
 * The form seeds its fields once, so it is mounted only when the profile is
 * known; otherwise saving would overwrite the stored profile with blanks.
 */
export default function ProfileSetupScreen() {
  const { colors } = useTheme();
  const { profile, profileFailed, refreshProfile } = useSocial();

  if (profile !== undefined) return <ProfileForm />;
  return (
    <Screen>
      {profileFailed ? (
        <Card>
          <Text style={[styles.note, { color: colors.textMuted }]}>Could not load your profile.</Text>
          <Button label="Try again" onPress={() => void refreshProfile().catch(() => undefined)} />
        </Card>
      ) : (
        <ActivityIndicator color={colors.text} />
      )}
    </Screen>
  );
}

function ProfileForm() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, refreshProfile } = useSocial();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [instagram, setInstagram] = useState(profile?.instagram ?? '');
  const [visibility, setVisibility] = useState<Visibility>(profile?.is_private === false ? 'public' : 'private');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const fields = normaliseProfile({ username, displayName, instagram });
    const found = profileProblem(fields);
    if (found !== null) {
      setProblem(found);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await saveProfile({ ...fields, is_private: visibility === 'private' });
      await refreshProfile();
      router.back();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={20} placeholder="alex.lifts" hint="3 to 20 lower-case letters, numbers, _ or ." />
        <Field label="Name" value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="Alex" />
        <Field label="Instagram (optional)" value={instagram} onChangeText={setInstagram} autoCapitalize="none" autoCorrect={false} maxLength={31} placeholder="@yourhandle" />
        <Segmented
          label="Who can see your posts"
          options={[
            { value: 'private', label: 'People I approve' },
            { value: 'public', label: 'Anyone' },
          ]}
          value={visibility}
          onChange={setVisibility}
        />
        <Text style={[styles.note, { color: colors.textFaint }]}>
          Following arrives in the next update. Until then, only you can see your posts either way.
          Your username, name and Instagram handle can be found by other signed-in users.
        </Text>
        <Button label={busy ? 'Saving…' : 'Save'} onPress={() => void save()} disabled={busy} />
        {problem && <Text style={[styles.problem, { color: colors.danger }]}>{problem}</Text>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 13, marginVertical: space.sm },
  problem: { fontFamily: font.ui, fontSize: 14, marginTop: space.sm },
});
