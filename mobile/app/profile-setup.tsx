import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AvatarPickerModal } from '../src/components/AvatarPickerModal';
import { Card } from '../src/components/Card';
import { Button, Field, Segmented } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { UserAvatar } from '../src/components/UserAvatar';
import { thud } from '../src/platform/haptics';
import { saveProfile } from '../src/social/api';
import { TRAINING_FOCUS_OPTIONS } from '../src/social/avatars';
import { normaliseProfile, profileProblem } from '../src/social/profileRules';
import { useSocial } from '../src/social/session';
import { font, radius, space, useTheme } from '../src/theme';

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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [trainingFocus, setTrainingFocus] = useState(profile?.training_focus ?? '');
  const [prHighlight, setPrHighlight] = useState(profile?.pr_highlight ?? '');
  const [visibility, setVisibility] = useState<Visibility>(profile?.is_private === false ? 'public' : 'private');

  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const fields = normaliseProfile({
      username,
      displayName,
      instagram,
      avatarUrl,
      bio,
      trainingFocus,
      prHighlight,
    });
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
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <UserAvatar
            avatarUrl={avatarUrl}
            username={username}
            name={displayName}
            size="xl"
            editable
            ring
            onPress={() => setAvatarModalOpen(true)}
          />
          <Tappable
            onPress={() => {
              thud('light');
              setAvatarModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Change profile avatar"
            style={[styles.changeAvatarBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <Ionicons name="camera-outline" size={16} color={colors.accent} />
            <Text style={[styles.changeAvatarText, { color: colors.accent }]}>
              Change Photo or Archetype
            </Text>
          </Tappable>
        </View>

        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          placeholder="alex.lifts"
          hint="3 to 20 lower-case letters, numbers, _ or ."
        />
        <Field
          label="Name"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
          placeholder="Alex"
        />

        {/* Training Focus Section */}
        <View style={styles.focusSection}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Training Focus</Text>
          <View style={styles.pillsRow}>
            {TRAINING_FOCUS_OPTIONS.map((opt) => {
              const active = trainingFocus === opt.value;
              return (
                <Tappable
                  key={opt.value}
                  onPress={() => {
                    thud('light');
                    setTrainingFocus(active ? '' : opt.value);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: active ? colors.accent : colors.surfaceRaised,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      {
                        color: active ? colors.onFill : colors.text,
                        fontFamily: active ? font.uiStrong : font.ui,
                      },
                    ]}
                  >
                    {opt.value}
                  </Text>
                </Tappable>
              );
            })}
          </View>
        </View>

        <Field
          label="Bio"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={240}
          placeholder="Share your split, athletic goals, or training philosophy..."
          hint={`${bio.length}/240 characters`}
        />

        <Field
          label="PR Highlight (optional)"
          value={prHighlight}
          onChangeText={setPrHighlight}
          maxLength={80}
          placeholder="e.g. 405 Squat • 315 Bench • 500 Deadlift"
          hint="Proudest personal records or achievements"
        />

        <Field
          label="Instagram (optional)"
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={31}
          placeholder="@yourhandle"
        />

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
          Your username, name, avatar, bio, and training focus can be discovered by other athletes.
        </Text>

        <Button label={busy ? 'Saving…' : 'Save Profile'} onPress={() => void save()} disabled={busy} />
        {problem && <Text style={[styles.problem, { color: colors.danger }]}>{problem}</Text>}
      </Card>

      <AvatarPickerModal
        visible={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        currentAvatarUrl={avatarUrl}
        onSelectAvatar={setAvatarUrl}
        username={username}
        name={displayName}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatarSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: space.md,
    gap: space.sm,
  },
  changeAvatarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 4,
  },
  changeAvatarText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
  focusSection: {
    marginBottom: space.md,
  },
  fieldLabel: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    marginBottom: space.xs,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
  },
  note: {
    fontFamily: font.ui,
    fontSize: 13,
    marginVertical: space.sm,
    lineHeight: 18,
  },
  problem: {
    fontFamily: font.ui,
    fontSize: 14,
    marginTop: space.sm,
  },
});
