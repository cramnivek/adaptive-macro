import type { ActivityLevel, Goal, UserProfile } from '@adaptive-macros/engine';
import type { Session } from '@supabase/supabase-js';
import type { AppSettings, DashboardSpotlight, UnitSystem, UserMission } from '../state/settings';
import { supabase } from './client';

export interface CloudBaseline {
  onboarded: true;
  userMission: UserMission;
  dashboardSpotlight: DashboardSpotlight;
  units: UnitSystem;
  profile: UserProfile;
  activity: ActivityLevel;
  goal: Goal;
  goalWeightKg: number | null;
  initialWeightKg?: number;
  updatedAt: string;
}

/**
 * Best-effort push of the user's onboarding and baseline settings to Supabase user_metadata.
 *
 * Stored in `auth.users.raw_user_meta_data.ascend_baseline` rather than `public.profiles`
 * because `public.profiles` is readable by all signed-in users for username search.
 * Never throws: offline use must never be interrupted when the network is unreachable.
 */
export const pushBaselineToCloud = async (
  settings: AppSettings,
  initialWeightKg?: number,
): Promise<void> => {
  if (!supabase || !settings.onboarded) return;
  try {
    const payload: CloudBaseline = {
      onboarded: true,
      userMission: settings.userMission ?? 'hybrid',
      dashboardSpotlight: settings.dashboardSpotlight ?? 'balanced',
      units: settings.units,
      profile: settings.profile,
      activity: settings.activity,
      goal: settings.goal,
      goalWeightKg: settings.goalWeightKg,
      ...(initialWeightKg !== undefined ? { initialWeightKg } : {}),
      updatedAt: new Date().toISOString(),
    };
    await supabase.auth.updateUser({ data: { ascend_baseline: payload } });
  } catch {
    // Offline or no session; local SQLite remains the source of truth on this device.
  }
};

/**
 * Clears cloud baseline metadata from Supabase user_metadata (for testing / reset).
 */
export const resetCloudBaseline = async (): Promise<void> => {
  if (!supabase) return;
  try {
    await supabase.auth.updateUser({ data: { ascend_baseline: null } });
  } catch {
    // Offline or no session
  }
};

/**
 * Extracts a valid CloudBaseline from a Supabase session's user_metadata, if present.
 */
export const readBaselineFromSession = (
  session: Session | null | undefined,
): CloudBaseline | null => {
  const raw = session?.user?.user_metadata?.ascend_baseline as Partial<CloudBaseline> | undefined;
  if (!raw || raw.onboarded !== true || !raw.profile || !raw.goal) return null;
  if (
    typeof raw.profile.age !== 'number' ||
    typeof raw.profile.heightCm !== 'number' ||
    (raw.profile.sex !== 'male' && raw.profile.sex !== 'female')
  ) {
    return null;
  }
  return raw as CloudBaseline;
};
