import { todayISO } from '@adaptive-macros/engine';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { pushBaselineToCloud, readBaselineFromSession } from '../social/baselineSync';
import { useSocial } from '../social/session';
import { useApp } from '../state/AppStore';

/**
 * Keeps the app behind a one-time sign-in, social profile setup, and baseline onboarding.
 *
 * Once signed in, the cached session is enough — offline, or with an expired
 * token — because logging a set in a basement gym must never be blocked.
 * Food and training logs live on this device and are not tied to the account,
 * so nothing here clears or resets local storage.
 */
const AUTH_PUBLIC_ROUTES = new Set(['sign-in', 'privacy']);

export const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { configured, session, profile } = useSocial();
  const { ready, settings, updateSettings, weights, recordWeight } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const rootSegment: string = segments[0] ?? '';
  const syncedUserIdRef = useRef<string | null>(null);

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
      if (session === null) {
        if (!AUTH_PUBLIC_ROUTES.has(rootSegment)) router.replace('/sign-in');
        return;
      }
      // Signed in: only redirect to profile-setup when we positively know profile === null.
      // When offline (`profileFailed`), `profile` stays `undefined` and we do NOT block the user.
      if (profile === null && rootSegment !== 'profile-setup' && rootSegment !== 'privacy') {
        router.replace('/profile-setup');
        return;
      }
      if (profile === undefined && rootSegment === 'sign-in') {
        return;
      }
    }

    // Auth & social profile satisfied (or auth not configured in this build): enforce baseline onboarding
    if (
      !settings.onboarded &&
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

  if (!ready) return null;
  if (configured && session === undefined) return null;
  if (configured && session === null && !AUTH_PUBLIC_ROUTES.has(rootSegment)) return null;
  return <>{children}</>;
};
