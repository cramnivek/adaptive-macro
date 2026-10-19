import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { Tappable } from '../src/components/Tappable';
import { sendCode, verifyCode } from '../src/social/api';
import { useSocial } from '../src/social/session';
import {
  appleAvailable,
  signInWithApple,
  signInWithGoogle,
  SignInCancelled,
} from '../src/social/socialSignIn';
import { SKEW, font, radius, space, useTheme } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';

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
 * Sign in screen with one-tap Google and Apple sign-in, plus email magic code fallback.
 *
 * Infused with Ascend's signature aggressive athletic visual identity:
 * - Official split-ring logo emblem with skewed energy backdrop (`SKEW = -8deg`).
 * - Signature `ASCEND ///` wordmark with loud red brand strokes (`#E8352A`).
 * - Skewed motto slab: "ADAPTIVE NUTRITION & TRAINING".
 * - Brand philosophy: "Calm when tracking. Focused when training. Built for serious lifters."
 * - Balanced OLED dark mode card with 1-tap Google, Apple, and OTP email auth.
 * - Reassuring local-first offline privacy badge.
 */
export default function SignInScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshProfile } = useSocial();

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

  const verify = () =>
    run(async () => {
      if (sentTo === null) return;
      await verifyCode(sentTo, code);
      await finishSignIn();
    });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + space.lg,
            paddingBottom: insets.bottom + space.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          {/* Aggressive Brand Hero Header */}
          <View style={styles.heroHeader}>
            {/* Logo Emblem */}
            <View
              style={[
                styles.emblemContainer,
                {
                  borderColor: 'rgba(232, 53, 42, 0.65)',
                  backgroundColor: '#0A0A0B',
                },
              ]}
            >
              <Image
                source={require('../assets/icon.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
            </View>

            {/* Signature ASCEND /// Wordmark */}
            <View style={styles.wordmarkRow}>
              <Text style={[styles.brandTitle, { color: colors.text }]}>ASCEND</Text>
              <Text style={[styles.brandSlashes, { color: loud.loud }]}>///</Text>
            </View>

            {/* Skewed Motto Slab Badge */}
            <View style={styles.mottoTagWrapper}>
              <View
                style={[
                  styles.mottoTagBg,
                  {
                    backgroundColor: 'rgba(232, 53, 42, 0.14)',
                    borderColor: 'rgba(232, 53, 42, 0.45)',
                    transform: [{ skewX: SKEW }],
                  },
                ]}
              />
              <Text style={[styles.mottoText, { color: loud.loud }]}>
                ADAPTIVE NUTRITION & TRAINING
              </Text>
            </View>

            {/* Core Philosophy */}
            <Text style={[styles.brandTagline, { color: colors.textMuted }]}>
              Calm when tracking. Focused when training. Built for serious lifters.
            </Text>
          </View>

          {/* Elevated Authentication Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Card Title & Instructions */}
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {sentTo ? 'Check your email' : 'Sign In'}
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                {sentTo
                  ? `Enter the 6-digit code we sent to ${sentTo}`
                  : 'Link your account once. Your workout and nutrition logs stay 100% on this device.'}
              </Text>
            </View>

            {problem && (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: isDark ? 'rgba(224, 108, 96, 0.12)' : '#FDE8E8',
                    borderColor: colors.danger,
                  },
                ]}
              >
                <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{problem}</Text>
              </View>
            )}

            {sentTo === null ? (
              <>
                {/* 1-Tap Social Auth Section */}
                <View style={styles.socialGroup}>
                  <Tappable
                    onPress={() => void handleGoogle()}
                    disabled={busy}
                    style={{ opacity: busy ? 0.6 : 1 }}
                  >
                    <View
                      style={[
                        styles.socialButton,
                        {
                          backgroundColor: isDark ? colors.surfaceRaised : '#FFFFFF',
                          borderColor: isDark ? colors.border : '#E2E2DC',
                        },
                      ]}
                    >
                      <GoogleLogo size={20} />
                      <Text style={[styles.socialButtonText, { color: colors.text }]}>
                        Continue with Google
                      </Text>
                      {busy && (
                        <ActivityIndicator
                          size="small"
                          color={colors.text}
                          style={styles.spinner}
                        />
                      )}
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

                {/* Clean Divider */}
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textFaint }]}>
                    OR USE EMAIL
                  </Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                {/* Email Magic Code Input */}
                <View style={styles.formGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                    EMAIL ADDRESS
                  </Text>
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
                      placeholder="you@example.com"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!busy}
                    />
                  </View>
                </View>

                {/* Send Code Button */}
                <Tappable
                  onPress={() => void send()}
                  disabled={busy || !email.includes('@')}
                  style={{ opacity: busy || !email.includes('@') ? 0.45 : 1 }}
                >
                  <View style={[styles.submitButton, { backgroundColor: colors.accent }]}>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.onFill} />
                    ) : (
                      <View style={styles.buttonContentRow}>
                        <Text style={[styles.submitButtonText, { color: colors.onFill }]}>
                          Send Login Code
                        </Text>
                        <Ionicons name="arrow-forward" size={18} color={colors.onFill} />
                      </View>
                    )}
                  </View>
                </Tappable>
              </>
            ) : (
              <>
                {/* Email Target Indicator & Change Link */}
                <View
                  style={[
                    styles.sentTargetBadge,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons name="paper-plane-outline" size={16} color={colors.carbs} />
                  <Text
                    style={[styles.sentTargetText, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    Sent to <Text style={{ fontFamily: font.uiStrong }}>{sentTo}</Text>
                  </Text>
                  <Tappable
                    onPress={() => {
                      setSentTo(null);
                      setProblem(null);
                    }}
                  >
                    <Text style={[styles.changeActionText, { color: colors.carbs }]}>
                      Change
                    </Text>
                  </Tappable>
                </View>

                {/* 6-Digit Code Input */}
                <View style={styles.formGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                    6-DIGIT VERIFICATION CODE
                  </Text>
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
                      onChangeText={setCode}
                      onFocus={() => setIsCodeFocused(true)}
                      onBlur={() => setIsCodeFocused(false)}
                      placeholder="000000"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus
                      editable={!busy}
                    />
                  </View>
                </View>

                {/* Verify Button */}
                <Tappable
                  onPress={() => void verify()}
                  disabled={busy || code.trim().length !== 6}
                  style={{ opacity: busy || code.trim().length !== 6 ? 0.45 : 1 }}
                >
                  <View style={[styles.submitButton, { backgroundColor: colors.accent }]}>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.onFill} />
                    ) : (
                      <View style={styles.buttonContentRow}>
                        <Text style={[styles.submitButtonText, { color: colors.onFill }]}>
                          Verify & Sign In
                        </Text>
                        <Ionicons name="arrow-forward" size={18} color={colors.onFill} />
                      </View>
                    )}
                  </View>
                </Tappable>

                {/* Resend Link */}
                <View style={styles.resendRow}>
                  <Text style={[styles.resendLabel, { color: colors.textMuted }]}>
                    Didn't get the code?
                  </Text>
                  <Tappable onPress={() => void send()} disabled={busy}>
                    <Text style={[styles.resendAction, { color: colors.accent }]}>
                      Resend
                    </Text>
                  </Tappable>
                </View>
              </>
            )}
          </View>

          {/* Privacy & Local-First Assurance Badge */}
          <View style={styles.trustBadge}>
            <View style={styles.trustTitleRow}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colors.positive} />
              <Text style={[styles.trustTitle, { color: colors.textMuted }]}>
                100% Local-First & Offline Ready
              </Text>
            </View>
            <Text style={[styles.trustDescription, { color: colors.textFaint }]}>
              Your workouts, macro targets, and personal logs stay securely stored on this device.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  heroHeader: {
    alignItems: 'center',
    marginBottom: space.xl,
  },
  emblemContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: space.md,
  },
  brandLogo: {
    width: 68,
    height: 68,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 6,
  },
  brandTitle: {
    fontFamily: font.display,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 3,
  },
  brandSlashes: {
    fontFamily: font.display,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1,
  },
  mottoTagWrapper: {
    position: 'relative',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: space.sm,
    alignSelf: 'center',
  },
  mottoTagBg: {
    borderRadius: 4,
    borderWidth: 1,
  },
  mottoText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  brandTagline: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 320,
  },
  card: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    padding: space.xl,
    marginBottom: space.lg,
  },
  cardHeader: {
    marginBottom: space.lg,
  },
  cardTitle: {
    fontFamily: font.display,
    fontSize: 20,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
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
  spinner: {
    marginLeft: space.xs,
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
  dividerText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  formGroup: {
    marginBottom: space.md,
  },
  fieldLabel: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: space.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space.md,
  },
  inputIcon: {
    marginRight: space.sm,
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: font.ui,
    fontSize: 15,
  },
  submitButton: {
    height: 50,
    borderRadius: radius.lg,
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
  sentTargetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.md,
  },
  sentTargetText: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 13,
  },
  changeActionText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
  codeInputWrapper: {
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  codeInput: {
    width: '100%',
    textAlign: 'center',
    fontFamily: font.figure,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 10,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.md,
  },
  resendLabel: {
    fontFamily: font.ui,
    fontSize: 13,
  },
  resendAction: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  trustBadge: {
    alignItems: 'center',
    paddingHorizontal: space.md,
    gap: 4,
  },
  trustTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustTitle: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
  trustDescription: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    maxWidth: 320,
  },
});
