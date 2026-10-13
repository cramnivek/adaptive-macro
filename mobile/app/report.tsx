import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field, TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { confirm, notify } from '../src/dialog';
import { block, report, type ReportReason } from '../src/social/feed';
import { useSocial } from '../src/social/session';
import { font, radius, space, useTheme } from '../src/theme';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'abuse', label: 'Abusive' },
  { value: 'nudity', label: 'Nudity' },
  { value: 'other', label: 'Something else' },
];

/**
 * Reports a workout, or a person when no workout is given, and offers to block them.
 *
 * Report and Block sit on one screen because someone reporting abuse usually wants it to stop
 * now, not after a review. Blocking is a separate button rather than a checkbox on Send, so
 * neither can happen by accident.
 */
export default function ReportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { configured, session, profile } = useSocial();
  const params = useLocalSearchParams<{ postId?: string; profileId?: string; username?: string }>();
  const postId = typeof params.postId === 'string' && params.postId !== '' ? params.postId : undefined;
  const profileId = typeof params.profileId === 'string' ? params.profileId : '';
  const username = typeof params.username === 'string' ? params.username : '';
  const [reason, setReason] = useState<ReportReason>('spam');
  const [note, setNote] = useState('');
  // Held across both buttons, so neither can be tapped again while the other is in flight.
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      // A workout is reported as the workout; the person is only the subject when no workout is.
      await report(postId ? { postId, reason, note } : { profileId, reason, note });
      notify('Thanks — we’ll look at it');
      router.back();
    } catch (error) {
      notify('Could not send that', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const blockThem = async () => {
    const sure = await confirm({
      title: `Block @${username}?`,
      message: "You won't see each other's workouts or profiles, and any following between you ends.",
      confirmLabel: 'Block',
      destructive: true,
    });
    if (!sure) return;
    setBusy(true);
    try {
      await block(profileId);
      notify(`Blocked @${username}`);
      // Back out of this screen and whatever showed the person, which would otherwise still be
      // on screen with their posts; the Social tab is the one place that is always safe to land.
      router.dismissTo('/social');
    } catch (error) {
      notify('Could not block them', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const say = (words: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{words}</Text>;

  if (!configured) return <Screen>{say('Social is not set up in this build.')}</Screen>;
  if (session === undefined || profile === undefined) return <Screen><ActivityIndicator color={colors.text} /></Screen>;
  if (session === null || profile === null) {
    return (
      <Screen>
        <Card>
          {say('Sign in and choose a username to report or block.')}
          <Button label={session === null ? 'Sign in' : 'Choose a username'} onPress={() => router.push(session === null ? '/sign-in' : '/profile-setup')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={postId ? 'Report this workout' : `Report @${username}`}>
      <Card title="What's wrong?">
        {REASONS.map((option) => {
          const active = option.value === reason;
          return (
            <Tappable
              key={option.value}
              onPress={() => setReason(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[
                styles.reason,
                { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.reasonLabel, { color: active ? colors.onFill : colors.text }]}>{option.label}</Text>
            </Tappable>
          );
        })}
        <Field
          label="Anything to add? (optional)"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={300}
        />
        <Button label="Send report" disabled={busy} onPress={() => void send()} />
      </Card>
      <Card>
        {say('Reporting tells us. Blocking stops it for you now.')}
        <Button label={`Block @${username}`} variant="danger" disabled={busy} onPress={() => void blockThem()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  reason: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  reasonLabel: { fontFamily: font.uiStrong, fontSize: 15 },
});
