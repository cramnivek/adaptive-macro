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

const mockSupabase = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../client', () => ({
  get supabase() {
    return mockSupabase.current;
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayISO } from '@adaptive-macros/engine';
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

  it('refuses to fabricate mock squads when offline with unknown code', async () => {
    await expect(
      joinSquadByCode({
        inviteCode: 'XYZ99',
        user: mockUser,
      }),
    ).rejects.toThrow(/internet connection is required/i);

    expect(await getMySquad()).toBeNull();
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

describe('Training Squads - Supabase Multiplayer integration', () => {
  const mockUser = {
    id: 'user-uuid-1',
    username: 'multi_lifter',
    displayName: 'Multi Lifter',
  };

  const fakeSquad = {
    id: 'squad-uuid-1234',
    name: 'Apex Lifters',
    invite_code: 'APEX26',
    weekly_target: 18,
    created_by: mockUser.id,
    created_at: new Date().toISOString(),
  };

  const fakeMembers = [
    { squad_id: fakeSquad.id, user_id: mockUser.id, role: 'owner', joined_at: new Date().toISOString() },
    { squad_id: fakeSquad.id, user_id: 'user-uuid-2', role: 'member', joined_at: new Date().toISOString() },
  ];

  const fakeProfiles = [
    { id: mockUser.id, username: mockUser.username, display_name: mockUser.displayName },
    { id: 'user-uuid-2', username: 'partner_joe', display_name: 'Partner Joe' },
  ];

  const fakeCheckins = [
    {
      id: 'checkin-uuid-101',
      squad_id: fakeSquad.id,
      user_id: 'user-uuid-2',
      workout_id: 'w-1',
      performed_on: todayISO(),
      pr_highlight: 'Bench 120kg',
      created_at: new Date().toISOString(),
    },
  ];

  const fakeCheers = [{ checkin_id: 'checkin-uuid-101', user_id: mockUser.id }];

  beforeEach(() => {
    mockSupabase.current = null;
  });

  it('fetches squad from Supabase, aggregates weekly sessions, and maps checkins/cheers', async () => {
    mockSupabase.current = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: mockUser.id } } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'squad_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [fakeMembers[0]], error: null }),
            // for all members query:
            then: vi.fn((resolve: (val: any) => void) =>
              resolve({ data: fakeMembers, error: null }),
            ),
          };
        }
        if (table === 'squads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: fakeSquad, error: null }),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: fakeProfiles, error: null }),
          };
        }
        if (table === 'squad_checkins') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: fakeCheckins, error: null }),
          };
        }
        if (table === 'squad_cheers') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: fakeCheers, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      }),
    };

    const squad = await getMySquad(mockUser);
    expect(squad).not.toBeNull();
    expect(squad?.id).toBe(fakeSquad.id);
    expect(squad?.name).toBe('Apex Lifters');
    expect(squad?.members).toHaveLength(2);
    expect(squad?.recentActivity).toHaveLength(1);
    expect(squad?.recentActivity[0].hasCheered).toBe(true);
    expect(squad?.recentActivity[0].cheersCount).toBe(1);
  });

  it('enforces 6-member capacity check when joining squad on Supabase', async () => {
    mockSupabase.current = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: mockUser.id } } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'squads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: fakeSquad, error: null }),
          };
        }
        if (table === 'squad_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 6, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      }),
    };

    await expect(
      joinSquadByCode({
        inviteCode: 'APEX26',
        user: mockUser,
      }),
    ).rejects.toThrow(/full capacity/);
  });

  it('throws error when squad code does not exist on Supabase', async () => {
    mockSupabase.current = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: mockUser.id } } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'squads') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      }),
    };

    await expect(
      joinSquadByCode({
        inviteCode: 'UNKNOWN',
        user: mockUser,
      }),
    ).rejects.toThrow(/was not found/);
  });
});
