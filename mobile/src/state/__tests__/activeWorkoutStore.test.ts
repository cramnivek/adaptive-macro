import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getActiveWorkoutState,
  updateActiveWorkoutState,
  subscribeActiveWorkout,
  startRestCountdown,
  adjustRestCountdown,
  clearRestCountdown,
  syncActiveSessionFromDb,
} from '../activeWorkoutStore';
import * as db from '../../db';

vi.mock('../../db', () => ({
  activeSession: vi.fn(),
}));

describe('activeWorkoutStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRestCountdown();
    updateActiveWorkoutState({
      hasActiveSession: false,
      sessionId: null,
      sessionName: null,
      date: null,
      startedAt: null,
      setsCount: 0,
      currentExerciseName: null,
      rest: null,
    });
  });

  it('initializes with inactive state', () => {
    const state = getActiveWorkoutState();
    expect(state.hasActiveSession).toBe(false);
    expect(state.sessionId).toBeNull();
    expect(state.rest).toBeNull();
  });

  it('notifies subscribers immediately and on subsequent updates', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveWorkout(listener);

    expect(listener).toHaveBeenCalledTimes(1);

    updateActiveWorkoutState({ sessionName: 'Push Day A' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionName: 'Push Day A' }),
    );

    unsubscribe();
    updateActiveWorkoutState({ sessionName: 'Pull Day' });
    expect(listener).toHaveBeenCalledTimes(2); // no more calls after unsubscribe
  });

  it('manages rest countdown start, adjust, and clear', () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    startRestCountdown(90, 'Barbell Bench Press');
    let state = getActiveWorkoutState();
    expect(state.rest).toEqual({
      endsAt: now + 90000,
      total: 90,
      exerciseName: 'Barbell Bench Press',
    });

    // Add 30 seconds
    adjustRestCountdown(30);
    state = getActiveWorkoutState();
    expect(state.rest?.endsAt).toBe(now + 120000);
    expect(state.rest?.total).toBe(120);

    // Subtract 15 seconds
    adjustRestCountdown(-15);
    state = getActiveWorkoutState();
    expect(state.rest?.endsAt).toBe(now + 105000);

    clearRestCountdown();
    state = getActiveWorkoutState();
    expect(state.rest).toBeNull();
  });

  it('syncs active session state from db when active session exists', async () => {
    vi.mocked(db.activeSession).mockResolvedValue({
      id: 'session-xyz',
      name: 'Leg Day Volume',
      date: '2026-10-19',
      startedAt: '14:30',
      sets: [
        {
          id: 'set-1',
          exerciseId: 'squat',
          exerciseName: 'Barbell Back Squat',
          weight: 120,
          reps: 8,
          setType: 'normal',
        },
      ],
    } as any);

    const state = await syncActiveSessionFromDb();
    expect(state.hasActiveSession).toBe(true);
    expect(state.sessionId).toBe('session-xyz');
    expect(state.sessionName).toBe('Leg Day Volume');
    expect(state.currentExerciseName).toBe('Barbell Back Squat');
    expect(state.setsCount).toBe(1);
  });

  it('resets state when db returns no active session', async () => {
    updateActiveWorkoutState({
      hasActiveSession: true,
      sessionId: 'old-session',
    });

    vi.mocked(db.activeSession).mockResolvedValue(null);

    const state = await syncActiveSessionFromDb();
    expect(state.hasActiveSession).toBe(false);
    expect(state.sessionId).toBeNull();
    expect(state.rest).toBeNull();
  });
});
