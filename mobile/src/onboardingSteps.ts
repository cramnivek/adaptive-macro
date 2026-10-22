import type { GoalDirection } from '@adaptive-macros/engine';

/**
 * Which screens first run shows, and in what order.
 *
 * First run was one form on one card, and the choices that shape the app —
 * what Today leads with, the coach's voice, the check-in day — lived in
 * Settings, where most people never look. Now each is a full screen of its
 * own, asked once, in a flow with no Skip; only Health Connect can be put
 * off, because a permission must always be optional.
 *
 * Someone set up before these screens existed sees only the new ones, once,
 * plus their numbers to confirm, prefilled: age and height drift, and the first
 * estimate is built on them.
 */

export type OnboardingStep =
  | 'goal'
  | 'body'
  | 'activity'
  | 'plan'
  | 'focus'
  | 'voice'
  | 'checkin'
  | 'health'
  | 'ready';

/** Raised whenever a step is added that people already set up should be asked. */
export const ONBOARDING_VERSION = 2;

export const needsOnboarding = ({ onboarded, completedVersion }: { onboarded: boolean; completedVersion: number }) =>
  !onboarded || completedVersion < ONBOARDING_VERSION;

export const onboardingSteps = ({
  onboarded,
  completedVersion,
  goal,
  android,
}: {
  onboarded: boolean;
  completedVersion: number;
  goal: GoalDirection;
  android: boolean;
}): OnboardingStep[] => {
  const baseline: OnboardingStep[] = onboarded
    ? []
    : ['goal', 'body', 'activity', ...(goal === 'maintain' ? [] : (['plan'] as const))];
  const added: OnboardingStep[] =
    completedVersion < ONBOARDING_VERSION
      ? [
          // Age, height and weight are what the first estimate is built on, so
          // someone set up is asked to confirm them, prefilled, rather than skipped.
          ...(onboarded ? (['body'] as const) : []),
          'focus',
          'voice',
          'checkin',
          ...(android ? (['health'] as const) : []),
        ]
      : [];
  return [...baseline, ...added, 'ready'];
};
