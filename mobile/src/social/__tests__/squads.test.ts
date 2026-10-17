import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore: Record<string, string> = {};
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockStore[key] ?? null),
    setItem: vi.fn(async (key: string, val: string) => {
      mockStore[key] = val;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete mockStore[key];
    }),
    clear: vi.fn(async () => {
      for (const k of Object.keys(mockStore)) delete mockStore[k];
    }),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cheerSquadActivity,
  createDefaultDemoSquad,
  createSquad,
  generateInviteCode,
  getMondayISO,
  getMySquad,
  joinSquadByCode,
  leaveSquad,
  recordSquadWorkoutSession,
} from '../squads';

describe('Training Squads service', () => {
  const mockUser = {
    id: 'user-1',
    username: 'iron_lifter',
    displayName: 'Marc K.',
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('generates a 6-character uppercase alphanumeric code', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[2-9A-Z]{6}$/);
  });

  it('calculates the Monday of the week correctly', () => {
    // 2026-10-18 was Sunday -> Monday was 2026-10-12
    const monday = getMondayISO('2026-10-18');
    expect(monday).toBe('2026-10-12');

    // 2026-10-12 was Monday -> returns 2026-10-12
    expect(getMondayISO('2026-10-12')).toBe('2026-10-12');
  });

  it('creates a new training squad and sets the user as owner', async () => {
    const squad = await createSquad({
      name: 'The Iron Club',
      weeklyTargetSessions: 16,
      user: mockUser,
    });

    expect(squad.name).toBe('The Iron Club');
    expect(squad.weeklyTargetSessions).toBe(16);
    expect(squad.members).toHaveLength(1);
    expect(squad.members[0].role).toBe('owner');
    expect(squad.members[0].userId).toBe('user-1');
    expect(squad.recentActivity).toHaveLength(1);

    const saved = await getMySquad();
    expect(saved?.id).toBe(squad.id);
  });

  it('joins a squad by invite code', async () => {
    const squad = await joinSquadByCode({
      inviteCode: 'IRON26',
      user: mockUser,
    });

    expect(squad.name).toBe('The Iron Club');
    expect(squad.members.length).toBeGreaterThan(1);
    expect(squad.inviteCode).toBe('IRON26');
  });

  it('records completed workouts and updates member weekly sessions', async () => {
    await createSquad({
      name: 'Alpha Lift',
      weeklyTargetSessions: 12,
      user: mockUser,
    });

    const updated = await recordSquadWorkoutSession({
      title: 'Upper Body Heavy',
      prHighlight: 'Bench Press 100 kg × 5',
      durationMin: 52,
      user: mockUser,
    });

    expect(updated?.members[0].weeklySessions).toBe(1);
    expect(updated?.members[0].bestPrThisWeek).toBe('Bench Press 100 kg × 5');
    expect(updated?.recentActivity[0].type).toBe('pr_set');
    expect(updated?.recentActivity[0].title).toContain('Bench Press 100 kg × 5');
  });

  it('cheers on a squad member activity', async () => {
    const squad = createDefaultDemoSquad(mockUser);
    await AsyncStorage.setItem('ascend_user_squad', JSON.stringify(squad));

    const targetActivity = squad.recentActivity[1]; // uncheered activity
    expect(targetActivity.hasCheered).toBe(false);
    const initialCheers = targetActivity.cheersCount;

    const afterCheer = await cheerSquadActivity(targetActivity.id);
    const cheeredAct = afterCheer?.recentActivity.find((a) => a.id === targetActivity.id);
    expect(cheeredAct?.hasCheered).toBe(true);
    expect(cheeredAct?.cheersCount).toBe(initialCheers + 1);

    // Toggle off
    const afterUncheer = await cheerSquadActivity(targetActivity.id);
    const uncheeredAct = afterUncheer?.recentActivity.find((a) => a.id === targetActivity.id);
    expect(uncheeredAct?.hasCheered).toBe(false);
    expect(uncheeredAct?.cheersCount).toBe(initialCheers);
  });

  it('leaves a squad cleanly', async () => {
    await createSquad({
      name: 'Leave Test',
      user: mockUser,
    });

    expect(await getMySquad()).not.toBeNull();
    await leaveSquad();
    expect(await getMySquad()).toBeNull();
  });
});
