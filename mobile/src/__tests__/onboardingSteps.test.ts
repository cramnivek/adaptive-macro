import { describe, expect, it } from 'vitest';
import { ONBOARDING_VERSION, needsOnboarding, onboardingSteps } from '../onboardingSteps';

describe('onboardingSteps', () => {
  it('walks a new person through everything, one question a screen', () => {
    expect(onboardingSteps({ onboarded: false, completedVersion: 0, goal: 'lose', android: true })).toEqual([
      'goal',
      'body',
      'activity',
      'plan',
      'focus',
      'voice',
      'checkin',
      'health',
      'ready',
    ]);
  });

  it('skips the target date for maintaining, and Health Connect off Android', () => {
    expect(onboardingSteps({ onboarded: false, completedVersion: 0, goal: 'maintain', android: false })).toEqual([
      'goal',
      'body',
      'activity',
      'focus',
      'voice',
      'checkin',
      'ready',
    ]);
  });

  it('asks someone already set up what is new, and to confirm their numbers', () => {
    expect(onboardingSteps({ onboarded: true, completedVersion: 0, goal: 'lose', android: true })).toEqual([
      'body',
      'focus',
      'voice',
      'checkin',
      'health',
      'ready',
    ]);
  });
});

describe('needsOnboarding', () => {
  it('is for anyone not set up, and once for anyone set up before these steps existed', () => {
    expect(needsOnboarding({ onboarded: false, completedVersion: 0 })).toBe(true);
    expect(needsOnboarding({ onboarded: true, completedVersion: 0 })).toBe(true);
    expect(needsOnboarding({ onboarded: true, completedVersion: ONBOARDING_VERSION })).toBe(false);
  });
});
