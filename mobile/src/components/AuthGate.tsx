import { todayISO } from '@adaptive-macros/engine';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { pushBaselineToCloud, readBaselineFromSession } from '../social/baselineSync';
import { useSocial } from '../social/session';
import { needsOnboarding } from '../onboardingSteps';
import { useApp } from '../state/AppStore';
import { useTheme } from '../theme';
import { AppArrival } from './AppArrival';

/**
 * Keeps the app behind a one-time sign-in, social profile setup, and baseline onboarding.
 *
 * The sign-in is a door, not a wall: "Continue without an account" on the
 * sign-in screen sets `accountSkipped`, and from then on a signed-out person
 * goes straight to the app. Food, weight and training never needed an account
 * — they live on this device — and only the feed and squads ask for one, from
 * their own screens.
 *
 * Once signed in, the cached session is enough — offline, or with an expired
 * token — because logging a set in a basement gym must never be blocked.
 * Food and training logs live on this device, in a database file of the
 * signed-in account's own, or of nobody's when there is no account (see
 * `db/accountDatabase.ts`). So nothing here clears or resets local storage:
 * signing in or out opens a different file instead.
 */
const AUTH_PUBLIC_ROUTES = new Set(['sign-in', 'privacy']);

export const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { configured, session, profile } = useSocial();
  const { ready, settings, updateSettings, weights, recordWeight } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const rootSegment: string = segments[0] ?? '';
  const syncedUserIdRef = useRef<string | null>(null);
  const shown = useRef(false);
  const { colors } = useTheme();

  const latestWeightKg = weights.length > 0 ? weights[weights.length - 1].kg : null;

  useEffect(() => {
    if (!ready) return;

    const cloudBaseline = readBaselineFromSession(session);
    const userId = session?.user?.id ?? null;

    // 1. If the user signed in on a fresh device (local !onboarded) and their account
    // already carries a cloud baseline, hydrate local SQLite automatically.
    if (!settings.onboarded && cloudBaseline !== null) {
      if (
        latestWeightKg === null &&
        typeof cloudBaseline.initialWeightKg === 'number' &&
        cloudBaseline.initialWeightKg > 0
      ) {
        void recordWeight(todayISO(), cloudBaseline.initialWeightKg);
      }
      void updateSettings({
        onboarded: true,
        userMission: cloudBaseline.userMission,
        dashboardSpotlight: cloudBaseline.dashboardSpotlight,
        missionOnboardingDismissed: true,
        featureOnboardingDismissed: true,
        units: cloudBaseline.units,
        workoutUnits: cloudBaseline.units,
        profile: cloudBaseline.profile,
        activity: cloudBaseline.activity,
        goal: cloudBaseline.goal,
        goalWeightKg: cloudBaseline.goalWeightKg,
      });
      return;
    }

    // 2. If an existing tester already onboarded locally before cloud baseline sync existed,
    // back up their local baseline to Supabase user_metadata once per session.
    if (
      settings.onboarded &&
      cloudBaseline === null &&
      userId !== null &&
      syncedUserIdRef.current !== userId
    ) {
      syncedUserIdRef.current = userId;
      void pushBaselineToCloud(settings, latestWeightKg ?? undefined);
    }

    if (configured) {
      if (session === undefined) return; // session still loading from storage
      if (session === null && !settings.accountSkipped) {
        if (!AUTH_PUBLIC_ROUTES.has(rootSegment)) router.replace('/sign-in');
        return;
      }
      // Signed in: only redirect to profile-setup when we positively know profile === null.
      // When offline (`profileFailed`), `profile` stays `undefined` and we do NOT block the user.
      if (session && profile === null && rootSegment !== 'profile-setup' && rootSegment !== 'privacy') {
        router.replace('/profile-setup');
        return;
      }
      if (profile === undefined && rootSegment === 'sign-in') {
        return;
      }
    }

    // Auth & social profile satisfied (or auth not configured in this build): enforce
    // onboarding, and send anyone set up before its newer steps through those, once.
    if (
      needsOnboarding({ onboarded: settings.onboarded, completedVersion: settings.onboardingVersion }) &&
      rootSegment !== 'onboard' &&
      rootSegment !== 'profile-setup' &&
      rootSegment !== 'sign-in' &&
      rootSegment !== 'privacy'
    ) {
      router.replace('/onboard');
    }
  }, [
    ready,
    configured,
    session,
    profile,
    settings,
    latestWeightKg,
    recordWeight,
    updateSettings,
    rootSegment,
    router,
  ]);

  const hold =
    !ready ||
    (configured && session === undefined) ||
    (configured && session === null && !settings.accountSkipped && !AUTH_PUBLIC_ROUTES.has(rootSegment));
  if (hold && !shown.current) return null;
  shown.current = true;
  // Once the navigator is up it stays up, covered, while the next person's log
  // loads. Unmounting it, as this used to, makes the router rebuild it from
  // the bare root URL; with a log per account that happens on every sign-in,
  // and the Android build then showed "Unmatched Route" for ascend:///.
  // The opening fade wraps both, so it plays once, the first time the app is
  // shown, and is not replayed under the cover on a later change of owner.
  return (
    <AppArrival background={colors.background}>
      {children}
      {hold && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />}
    </AppArrival>
  );
};
