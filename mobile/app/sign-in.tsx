import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { BrandLockup } from '../src/components/BrandLockup';
import { Tappable } from '../src/components/Tappable';
import { BRAND } from '../src/brand';
import { sendCode, verifyCode } from '../src/social/api';
import { useSocial } from '../src/social/session';
import { useApp } from '../src/state/AppStore';
import {
  appleAvailable,
  signInWithApple,
  signInWithGoogle,
  SignInCancelled,
} from '../src/social/socialSignIn';
import { TOUCH_TARGET } from '../src/components/Controls';
import { font, radius, space, useTheme } from '../src/theme';

/** Official 4-color Google 'G' brand mark */
function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </Svg>
  );
}

/**
 * The door into the app, and the first thing anyone sees of it.
 *
 * Built to the house rule — calm when tracking, focused when training, loud
 * when celebrating. Signing in is none of the loud moments, so the screen is
 * the quiet palette with exactly one hit of red: the Ä inside the vector
 * wordmark, drawn the way every share card draws it. The skewed slab and the
 * red ring that used to sit here are the celebration's shapes, and spending
 * them on a login form left nothing for the PR that earns them.
 *
 * What it says about data has to be true. Food and workout logs never leave
 * the phone; the profile and starting targets do, to the account, so that a
 * new phone can be set up from them (`social/baselineSync.ts`). The old copy
 * said "100% on this device", twice, and that stopped being so.
 */
export default function SignInScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshProfile } = useSocial();
  const { updateSettings } = useApp();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [canApple, setCanApple] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isCodeFocused, setIsCodeFocused] = useState(false);

  useEffect(() => {
    void appleAvailable().then(setCanApple);
  }, []);

  // Something, an @, something, a dot, something. Loose on purpose: the server
  // is the real check, this only decides whether the button is worth lighting.
  const emailLooksRight = /^\S+@\S+\.\S+$/.test(email.trim());

  const finishSignIn = async () => {
    const profile = await refreshProfile().catch(() => undefined);
    if (profile === null) router.replace('/profile-setup');
    else router.replace('/');
  };

  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await step();
    } catch (error) {
      if (error instanceof SignInCancelled) return;
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = () =>
    run(async () => {
      await signInWithGoogle();
      await finishSignIn();
    });

  const handleApple = () =>
    run(async () => {
      await signInWithApple();
      await finishSignIn();
    });

  const send = () =>
    run(async () => {
      await sendCode(email);
      setSentTo(email.trim());
      setCode('');
    });

  // Takes the code as an argument so typing the sixth digit can submit it
  // directly, without waiting a render for the state to catch up.
  const verify = (entered: string = code) =>
    run(async () => {
      if (sentTo === null) return;
      await verifyCode(sentTo, entered);
      await finishSignIn();
    });

  // Everything but the feed and squads works on this device alone, so the
  // account is offered, not required. Back to wherever sent you here (a social
  // screen's "Sign in"), or into the app when this was the first screen.
  const skip = async () => {
    await updateSettings({ accountSkipped: true });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const onCodeChange = (text: string) => {
    // Digits only: a code pasted from Mail arrives as "123 456" often enough.
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    // The sixth digit is the only thing anyone would do before tapping Verify,
    // so it is the tap. iOS autofill from Mail lands all six at once.
    if (digits.length === 6 && !busy) void verify(digits);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + space.xl,
            paddingBottom: insets.bottom + space.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <View style={styles.brand}>
            <BrandLockup markColor={colors.brand.text} textColor={colors.text} size={30} />
            <Text style={[styles.descriptor, { color: colors.textFaint }]}>ADAPTIVE NUTRITION & TRAINING</Text>
          </View>

          {/* The motto as the app states it elsewhere, one beat per line. */}
          <View style={styles.motto}>
            {[
              ['CALM', 'when tracking.'],
              ['FOCUSED', 'when training.'],
              ['LOUD', 'when celebrating.'],
            ].map(([word, rest]) => (
              <Text key={word} style={[styles.mottoLine, { color: colors.textMuted }]}>
                <Text style={[styles.mottoWord, { color: colors.text }]}>{word}</Text> {rest}
              </Text>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {sentTo ? 'Check your email' : 'Sign in'}
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
              {sentTo
                ? 'Enter the six-digit code from the email we just sent.'
                : 'Optional. One account for the feed, your squad, and picking up on a new phone.'}
            </Text>

            {problem && (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: isDark ? 'rgba(224, 108, 96, 0.12)' : '#FDE8E8',
                    borderColor: colors.danger,
                  },
                ]}
                accessibilityLiveRegion="polite"
              >
                <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{problem}</Text>
              </View>
            )}

            {sentTo === null ? (
              <>
                <View style={styles.socialGroup}>
                  <Tappable
                    onPress={() => void handleGoogle()}
                    disabled={busy}
                    style={{ opacity: busy ? 0.6 : 1 }}
                    accessibilityRole="button"
                    accessibilityLabel="Continue with Google"
                  >
                    <View
                      style={[
                        styles.socialButton,
                        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                      ]}
                    >
                      <GoogleLogo size={20} />
                      <Text style={[styles.socialButtonText, { color: colors.text }]}>Continue with Google</Text>
                    </View>
                  </Tappable>

                  {canApple && (
                    <View style={styles.appleButtonContainer}>
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={
                          isDark
                            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                        }
                        cornerRadius={radius.lg}
                        style={styles.appleButton}
                        onPress={() => void handleApple()}
                      />
                    </View>
                  )}
                </View>

                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.microLabel, { color: colors.textFaint }]}>OR WITH EMAIL</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                <View
                  style={[
                    styles.inputWrapper,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: isEmailFocused ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={isEmailFocused ? colors.text : colors.textFaint}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setIsEmailFocused(true)}
                    onBlur={() => setIsEmailFocused(false)}
                    onSubmitEditing={() => emailLooksRight && !busy && void send()}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="email-address"
                    // So the phone offers the address it already knows instead
                    // of making someone type it with sweaty thumbs.
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                    accessibilityLabel="Email address"
                  />
                </View>

                <PrimaryAction
                  label="Email me a code"
                  ready={emailLooksRight}
                  busy={busy}
                  onPress={() => void send()}
                />
              </>
            ) : (
              <>
                <View style={[styles.sentRow, { borderColor: colors.border }]}>
                  <Text style={[styles.sentText, { color: colors.textMuted }]} numberOfLines={1}>
                    Sent to <Text style={{ fontFamily: font.uiStrong, color: colors.text }}>{sentTo}</Text>
                  </Text>
                  <Tappable
                    onPress={() => {
                      setSentTo(null);
                      setProblem(null);
                    }}
                    style={styles.textAction}
                    accessibilityRole="button"
                    accessibilityLabel="Use a different email"
                  >
                    <Text style={[styles.textActionLabel, { color: colors.text }]}>Change</Text>
                  </Tappable>
                </View>

                <View
                  style={[
                    styles.codeInputWrapper,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: isCodeFocused ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.codeInput, { color: colors.text }]}
                    value={code}
                    onChangeText={onCodeChange}
                    onFocus={() => setIsCodeFocused(true)}
                    onBlur={() => setIsCodeFocused(false)}
                    placeholder="000000"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                    // iOS offers the code from Mail above the keyboard with
                    // these, Android from its SMS/email retriever.
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    autoFocus
                    editable={!busy}
                    accessibilityLabel="Six-digit code"
                  />
                </View>

                <PrimaryAction
                  label="Verify and sign in"
                  ready={code.length === 6}
                  busy={busy}
                  onPress={() => void verify()}
                />

                <View style={styles.resendRow}>
                  <Text style={[styles.resendLabel, { color: colors.textMuted }]}>No code? Check spam, or</Text>
                  <Tappable
                    onPress={() => void send()}
                    disabled={busy}
                    style={styles.textAction}
                    accessibilityRole="button"
                    accessibilityLabel="Send the code again"
                  >
                    <Text style={[styles.textActionLabel, { color: colors.text }]}>send it again</Text>
                  </Tappable>
                </View>
              </>
            )}
          </View>

          {sentTo === null && (
            <Tappable
              onPress={() => void skip()}
              disabled={busy}
              style={styles.skip}
              accessibilityRole="button"
              accessibilityLabel={`Use ${BRAND.name} without an account`}
            >
              <Text style={[styles.skipLabel, { color: colors.text }]}>Use {BRAND.name} without an account</Text>
              <Text style={[styles.skipNote, { color: colors.textFaint }]}>
                You can sign in later from Settings or the Social tab.
              </Text>
            </Tappable>
          )}

          {/*
            One honest line about where things live, in place of the two
            "100% on this device" claims. The policy is a public route, so it
            opens without signing in.
          */}
          <View style={styles.trust}>
            <View style={[styles.trustRule, { backgroundColor: colors.border }]} />
            <Text style={[styles.trustText, { color: colors.textFaint }]}>
              Your food and workout logs stay on this phone. Your account keeps your profile, starting weight and
              goal, so a new phone can pick up where you left off.
            </Text>
            <Tappable
              onPress={() => router.push('/privacy')}
              style={styles.textAction}
              accessibilityRole="link"
              accessibilityLabel="Read the privacy policy"
            >
              <Text style={[styles.textActionLabel, { color: colors.textMuted }]}>Privacy policy</Text>
            </Tappable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * The form's one primary button.
 *
 * Not ready is drawn as an outline rather than the filled button at 45%
 * opacity: faded near-white on near-black is a large grey slab, which read as
 * broken and was the loudest thing on the screen before anyone had typed. The
 * outline says "next step, once you have filled this in", and fills the moment
 * it can be pressed.
 */
const PrimaryAction = ({
  label,
  ready,
  busy,
  onPress,
}: {
  label: string;
  ready: boolean;
  busy: boolean;
  onPress: () => void;
}) => {
  const { colors } = useTheme();
  const live = ready && !busy;
  return (
    <Tappable
      onPress={onPress}
      disabled={!live}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !live, busy }}
    >
      <View
        style={[
          styles.submitButton,
          ready
            ? { backgroundColor: colors.accent, borderColor: colors.accent }
            : { backgroundColor: 'transparent', borderColor: colors.border },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={ready ? colors.onFill : colors.textMuted} />
        ) : (
          <View style={styles.buttonContentRow}>
            <Text style={[styles.submitButtonText, { color: ready ? colors.onFill : colors.textFaint }]}>
              {label}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={ready ? colors.onFill : colors.textFaint} />
          </View>
        )}
      </View>
    </Tappable>
  );
};

// The browser's own focus box drew a second, black outline inside the field's
// wrapper. The wrapper already brightens its border on focus, so focus stays
// visible without it.
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: space.lg,
  },
  descriptor: {
    fontFamily: font.figure,
    fontSize: 10,
    letterSpacing: 1.6,
    marginTop: space.xs,
  },
  motto: {
    alignItems: 'center',
    gap: 2,
    marginBottom: space.xl,
  },
  mottoLine: {
    fontFamily: font.ui,
    fontSize: 14,
    lineHeight: 20,
  },
  mottoWord: {
    fontFamily: font.uiStrong,
    letterSpacing: 1.2,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: space.xl,
    marginBottom: space.xl,
  },
  cardTitle: {
    fontFamily: font.display,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: space.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.md,
  },
  errorText: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 17,
  },
  socialGroup: {
    gap: space.sm,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  socialButtonText: {
    fontFamily: font.uiStrong,
    fontSize: 15,
  },
  appleButtonContainer: {
    width: '100%',
    height: 50,
  },
  appleButton: {
    width: '100%',
    height: 50,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginVertical: space.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  microLabel: {
    fontFamily: font.figure,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  inputIcon: {
    marginRight: space.sm,
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: font.ui,
    fontSize: 16,
    ...webNoOutline,
  },
  submitButton: {
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  submitButtonText: {
    fontFamily: font.uiStrong,
    fontSize: 15,
  },
  sentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: space.md,
  },
  sentText: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 13,
  },
  // Text links get a full touch target's height: hitSlop does nothing on web.
  textAction: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  textActionLabel: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  codeInputWrapper: {
    height: 60,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  codeInput: {
    width: '100%',
    textAlign: 'center',
    fontFamily: font.figure,
    fontSize: 26,
    letterSpacing: 10,
    ...webNoOutline,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: space.xs,
  },
  resendLabel: {
    fontFamily: font.ui,
    fontSize: 13,
  },
  skip: {
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -space.sm,
    marginBottom: space.xl,
    gap: 2,
  },
  skipLabel: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  skipNote: {
    fontFamily: font.ui,
    fontSize: 12,
  },
  trust: {
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  trustRule: {
    width: 32,
    height: 2,
    borderRadius: radius.pill,
    marginBottom: space.md,
  },
  trustText: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 340,
  },
});
