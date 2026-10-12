import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { sendCode, verifyCode } from '../src/social/api';
import { useSocial } from '../src/social/session';
import { font, space, useTheme } from '../src/theme';

/**
 * Sign in with a code sent by email.
 *
 * A code rather than a link: the link would open in the mail app's browser,
 * and on an iPhone that is not the installed web app, so the session would
 * land somewhere the app cannot see. A code is typed where it is needed.
 * A first sign-in goes on to choosing a username; a returning one goes back.
 */
export default function SignInScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { refreshProfile } = useSocial();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await step();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      await sendCode(email);
      setSentTo(email.trim());
      setCode('');
    });

  const verify = () =>
    run(async () => {
      if (sentTo === null) return;
      await verifyCode(sentTo, code);
      // Signed in from here on. If the profile cannot be loaded, leave anyway: staying would show
      // a spent code, and the Account screen has its own could-not-load state.
      const profile = await refreshProfile().catch(() => undefined);
      if (profile === null) router.replace('/profile-setup');
      else router.back();
    });

  return (
    <Screen>
      <Card subtitle="An account is only needed to post workouts. Everything else works without one.">
        {sentTo === null ? (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@example.com"
            />
            <Button label={busy ? 'Sending…' : 'Send a code'} onPress={() => void send()} disabled={busy || !email.includes('@')} />
          </>
        ) : (
          <>
            <Text style={[styles.note, { color: colors.textMuted }]}>A 6-digit code is on its way to {sentTo}.</Text>
            <Field
              label="Code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={6}
              placeholder="123456"
            />
            <Button label={busy ? 'Checking…' : 'Sign in'} onPress={() => void verify()} disabled={busy || code.trim().length !== 6} />
            <Button label="Use a different email" variant="subtle" onPress={() => { setSentTo(null); setProblem(null); }} disabled={busy} />
          </>
        )}
        {problem && <Text style={[styles.problem, { color: colors.danger }]}>{problem}</Text>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  problem: { fontFamily: font.ui, fontSize: 14, marginTop: space.sm },
});
