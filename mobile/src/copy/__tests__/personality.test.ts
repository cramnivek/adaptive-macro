import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getEventCopy } from '../personality';
import * as flags from '../../flags';

describe('Personality System v2 - getEventCopy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns classic copy when feature flag is OFF', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(false);

    const prCopy = getEventCopy('workout.pr_verified', { personality: 'gymrat' });
    expect(prCopy).toBe('New personal record!');

    const finishCopy = getEventCopy('workout.completed', { personality: 'gymrat' });
    expect(finishCopy).toBe('Workout complete.');
  });

  it('returns appropriate variants when feature flag is ON', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    const classic = getEventCopy('workout.completed', { personality: 'classic' });
    expect(classic).toBe('Workout complete.');

    const ascend = getEventCopy('workout.completed', { personality: 'ascend', seed: 'workout-1' });
    expect(ascend.toLowerCase()).toContain('work');

    const gymrat = getEventCopy('workout.completed', { personality: 'gymrat' });
    expect(gymrat).toContain('COOKED');
  });

  it('keeps sensitive and system contexts strictly neutral across all personalities', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    const sensitiveGymrat = getEventCopy('sensitive.calorie_adj_title', { personality: 'gymrat' });
    expect(sensitiveGymrat).toBe('Review calorie target change');

    const systemGymrat = getEventCopy('system.upload_failed', { personality: 'gymrat' });
    expect(systemGymrat).toBe("Upload didn't go through. Your card is saved on this device.");
  });

  it('interpolates fact placeholders correctly', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    const result = getEventCopy('workout.pr_baseline_pill', {
      personality: 'ascend',
      facts: { e1rm: '100.0', unit: 'KG' },
    });
    expect(result).toBe('⭐ BASELINE SET · 100.0 KG EST. 1RM');
  });

  it('is deterministic: same seed always gives the exact same copy', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    const run1 = getEventCopy('workout.pr_verified', { personality: 'gymrat', seed: 'session-123' });
    const run2 = getEventCopy('workout.pr_verified', { personality: 'gymrat', seed: 'session-123' });
    const run3 = getEventCopy('workout.pr_verified', { personality: 'gymrat', seed: 'session-123' });

    expect(run1).toBe(run2);
    expect(run2).toBe(run3);
  });

  it('falls back safely to ascend on unknown/invalid personality', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    // @ts-expect-error testing invalid personality input
    const fallback = getEventCopy('workout.completed', { personality: 'unknown_mode' });
    expect(fallback).toBeTruthy();
    expect(fallback).not.toBe('Workout complete.');
  });
});
