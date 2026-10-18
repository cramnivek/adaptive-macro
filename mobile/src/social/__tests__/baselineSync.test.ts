import { describe, expect, it, vi } from 'vitest';

const mockUpdateUser = vi.fn();
vi.mock('../client', () => ({
  supabase: {
    auth: {
      updateUser: (...args: any[]) => mockUpdateUser(...args),
    },
  },
}));

import type { Session } from '@supabase/supabase-js';
import type { CloudBaseline } from '../baselineSync';
import {
  pushBaselineToCloud,
  readBaselineFromSession,
} from '../baselineSync';

describe('baselineSync', () => {
  it('reads valid baseline from session user_metadata', () => {
    const baseline: CloudBaseline = {
      onboarded: true,
      userMission: 'hypertrophy',
      dashboardSpotlight: 'workouts',
      units: 'imperial',
      profile: { sex: 'male', age: 29, heightCm: 180 },
      activity: 'active',
      goal: { direction: 'gain', rateKgPerWeek: 0.25 },
      goalWeightKg: 85,
      initialWeightKg: 80,
      updatedAt: '2026-10-19T00:00:00.000Z',
    };

    const session = {
      user: {
        id: 'user-123',
        user_metadata: {
          ascend_baseline: baseline,
        },
      },
    } as unknown as Session;

    const result = readBaselineFromSession(session);
    expect(result).toEqual(baseline);
  });

  it('returns null when session has no ascend_baseline or invalid data', () => {
    expect(readBaselineFromSession(null)).toBeNull();
    expect(readBaselineFromSession(undefined)).toBeNull();

    const emptySession = { user: { id: 'user-123', user_metadata: {} } } as unknown as Session;
    expect(readBaselineFromSession(emptySession)).toBeNull();

    const invalidSession = {
      user: {
        id: 'user-123',
        user_metadata: {
          ascend_baseline: {
            onboarded: true,
            profile: { sex: 'other', age: 'not-a-number', heightCm: null },
          },
        },
      },
    } as unknown as Session;
    expect(readBaselineFromSession(invalidSession)).toBeNull();
  });

  it('pushBaselineToCloud does not throw even if supabase call fails', async () => {
    mockUpdateUser.mockRejectedValueOnce(new Error('Network error'));

    const settings = {
      onboarded: true,
      userMission: 'hybrid',
      dashboardSpotlight: 'balanced',
      units: 'metric',
      profile: { sex: 'male', age: 25, heightCm: 175 },
      activity: 'moderate',
      goal: { direction: 'maintain', rateKgPerWeek: 0 },
      goalWeightKg: 75,
    } as any;

    await expect(pushBaselineToCloud(settings, 75)).resolves.not.toThrow();
  });
});
