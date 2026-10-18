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
    expect(gymrat).toMatch(/COOKED|UNSTOPPABLE|ANOTHER W/);
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

  it('supports Phase 2 workout rest, impact, discard, and milestone variants', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    // Rest done label
    expect(getEventCopy('workout.rest_done_label', { personality: 'classic' })).toBe('REST DONE');
    expect(getEventCopy('workout.rest_done_label', { personality: 'gymrat' })).toMatch(/COOK|LOCK IN|LAB/);

    // Rest done action button (functional label keeps clarity)
    expect(getEventCopy('workout.rest_done_btn', { personality: 'classic' })).toBe('OK');
    expect(getEventCopy('workout.rest_done_btn', { personality: 'gymrat' })).toMatch(/LET'S GO|LOCKED IN/);

    // Empty session title
    expect(getEventCopy('workout.empty_session_title', { personality: 'classic' })).toContain('Add an exercise');
    expect(getEventCopy('workout.empty_session_title', { personality: 'gymrat' })).toMatch(/COOK|EXERCISE/);

    // Milestone dismiss
    expect(getEventCopy('milestone.dismiss_btn', { personality: 'classic' })).toBe('OK');
    expect(getEventCopy('milestone.dismiss_btn', { personality: 'gymrat' })).toContain('W');
  });

  it('strictly enforces authoritative sensitivity even if caller passes context: "routine"', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    // Caller attempts to bypass sensitive context
    const overridden = getEventCopy('sensitive.calorie_adj_title', {
      personality: 'gymrat',
      context: 'routine',
    });
    expect(overridden).toBe('Review calorie target change');

    // Caller attempts to bypass system context
    const sysOverridden = getEventCopy('system.upload_failed', {
      personality: 'gymrat',
      context: 'achievement',
    });
    expect(sysOverridden).toBe("Upload didn't go through. Your card is saved on this device.");
  });

  it('returns a visible human-readable fallback string rather than blank for unknown event IDs', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    const unknown = getEventCopy('custom.unknown_event_id');
    expect(unknown).toBe('Unknown event id');

    const empty = getEventCopy('');
    expect(empty).toBe('Ready');

    const rawTemplate = getEventCopy('Hello {name}!', {
      facts: { name: 'Alex' },
    });
    expect(rawTemplate).toBe('Hello Alex!');
  });

  it('rotates variants naturally based on stable date-and-event seed when seed is omitted', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    // Call on day 1
    const day1Copy = getEventCopy('workout.completed', {
      personality: 'ascend',
      facts: { date: '2026-10-18' },
    });

    // Call on same day again -> strictly deterministic (no re-render flicker)
    const day1CopyAgain = getEventCopy('workout.completed', {
      personality: 'ascend',
      facts: { date: '2026-10-18' },
    });
    expect(day1Copy).toBe(day1CopyAgain);

    // Call on day 2
    const day2Copy = getEventCopy('workout.completed', {
      personality: 'ascend',
      facts: { date: '2026-10-19' },
    });
    expect(day1Copy).toBeTruthy();
    expect(day2Copy).toBeTruthy();
  });

  it('keeps functional action buttons clear and free of guilt/shaming in Gymrat mode', () => {
    vi.spyOn(flags, 'isPersonalityV2Enabled').mockReturnValue(true);

    // Finish workout action button
    expect(getEventCopy('workout.finish_btn', { personality: 'gymrat' })).toBe('FINISH WORKOUT');

    // Discard workout dialog
    expect(getEventCopy('workout.discard_title', { personality: 'gymrat' })).toBe('NO SETS LOGGED');
    expect(getEventCopy('workout.discard_message', { personality: 'gymrat' })).toBe(
      'Zero sets recorded. Discard this session?',
    );
    expect(getEventCopy('workout.discard_message', { personality: 'gymrat' })).not.toContain('💀');

    // Squad empty state headline
    expect(getEventCopy('social.squad_empty_headline', { personality: 'gymrat' })).toMatch(
      /THE SQUAD ARC STARTS HERE|TRAIN TOGETHER/,
    );
  });
});
