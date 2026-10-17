import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayISO } from '@adaptive-macros/engine';
import type { SquadActivity, SquadMember, TrainingSquad } from './squadTypes';

const SQUAD_STORAGE_KEY = 'ascend_user_squad';

/** Gets the ISO date of the Monday for the current week. */
export const getMondayISO = (dateStr: string = todayISO()): string => {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getTime() + diff * 86400000);
  return monday.toISOString().slice(0, 10);
};

export const generateInviteCode = (): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const createDefaultDemoSquad = (user: {
  id: string;
  username: string;
  displayName: string;
}): TrainingSquad => {
  const weekStart = getMondayISO();
  const members: SquadMember[] = [
    {
      userId: user.id,
      username: user.username,
      displayName: user.displayName || 'You',
      role: 'owner',
      joinedAt: new Date().toISOString(),
      weeklySessions: 3,
      bestPrThisWeek: 'Bench Press 95 kg × 6',
    },
    {
      userId: 'mock-u2',
      username: 'fiona_lifts',
      displayName: 'Fiona L.',
      role: 'member',
      joinedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      weeklySessions: 4,
      bestPrThisWeek: 'Squat 115 kg × 5',
    },
    {
      userId: 'mock-u3',
      username: 'javed_iron',
      displayName: 'Javed D.',
      role: 'member',
      joinedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      weeklySessions: 3,
      bestPrThisWeek: null,
    },
    {
      userId: 'mock-u4',
      username: 'alex_t',
      displayName: 'Alex T.',
      role: 'member',
      joinedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      weeklySessions: 2,
      bestPrThisWeek: 'Deadlift 160 kg × 3',
    },
  ];

  const recentActivity: SquadActivity[] = [
    {
      id: 'act-1',
      userId: 'mock-u2',
      username: 'fiona_lifts',
      displayName: 'Fiona L.',
      type: 'pr_set',
      title: 'New PR on Barbell Squat',
      detail: '115 kg × 5 reps (RPE 9)',
      timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
      cheersCount: 4,
      hasCheered: true,
    },
    {
      id: 'act-2',
      userId: user.id,
      username: user.username,
      displayName: user.displayName || 'You',
      type: 'workout_completed',
      title: 'Completed Push & Chest Session',
      detail: '48 min · 18 working sets',
      timestamp: new Date(Date.now() - 18 * 3600000).toISOString(),
      cheersCount: 3,
      hasCheered: false,
    },
    {
      id: 'act-3',
      userId: 'mock-u4',
      username: 'alex_t',
      displayName: 'Alex T.',
      type: 'workout_completed',
      title: 'Completed Heavy Pull Day',
      detail: '55 min · 22 working sets',
      timestamp: new Date(Date.now() - 28 * 3600000).toISOString(),
      cheersCount: 2,
      hasCheered: false,
    },
  ];

  return {
    id: 'squad-iron-club',
    name: 'The Iron Club',
    inviteCode: 'IRON26',
    weeklyTargetSessions: 16,
    weekStartDate: weekStart,
    createdBy: user.id,
    createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
    members,
    recentActivity,
  };
};

export const getMySquad = async (user?: {
  id: string;
  username: string;
  displayName: string;
}): Promise<TrainingSquad | null> => {
  try {
    const raw = await AsyncStorage.getItem(SQUAD_STORAGE_KEY);
    if (!raw) return null;
    const squad = JSON.parse(raw) as TrainingSquad;

    // Check week rollover
    const currentMonday = getMondayISO();
    if (squad.weekStartDate !== currentMonday) {
      squad.weekStartDate = currentMonday;
      squad.members = squad.members.map((m) => ({
        ...m,
        weeklySessions: 0,
        bestPrThisWeek: null,
      }));
      await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(squad));
    }
    return squad;
  } catch {
    return null;
  }
};

export const createSquad = async (params: {
  name: string;
  weeklyTargetSessions?: number;
  user: { id: string; username: string; displayName: string };
}): Promise<TrainingSquad> => {
  const { name, weeklyTargetSessions = 16, user } = params;
  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 40) {
    throw new Error('Squad name must be between 2 and 40 characters.');
  }

  const target = Math.max(6, Math.min(48, weeklyTargetSessions));
  const weekStart = getMondayISO();
  const inviteCode = generateInviteCode();
  const squadId = `squad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const newSquad: TrainingSquad = {
    id: squadId,
    name: trimmedName,
    inviteCode,
    weeklyTargetSessions: target,
    weekStartDate: weekStart,
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    members: [
      {
        userId: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        role: 'owner',
        joinedAt: new Date().toISOString(),
        weeklySessions: 0,
        bestPrThisWeek: null,
      },
    ],
    recentActivity: [
      {
        id: `act_${Date.now()}`,
        userId: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        type: 'joined_squad',
        title: `Created "${trimmedName}"`,
        detail: `Goal: ${target} sessions / week · Invite code: ${inviteCode}`,
        timestamp: new Date().toISOString(),
        cheersCount: 1,
        hasCheered: true,
      },
    ],
  };

  await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(newSquad));
  return newSquad;
};

export const joinSquadByCode = async (params: {
  inviteCode: string;
  user: { id: string; username: string; displayName: string };
}): Promise<TrainingSquad> => {
  const { inviteCode, user } = params;
  const cleanCode = inviteCode.trim().toUpperCase();
  if (cleanCode.length < 4 || cleanCode.length > 8) {
    throw new Error('Please enter a valid 6-character squad code.');
  }

  // If joining demo code "IRON26", return demo squad
  if (cleanCode === 'IRON26') {
    const demo = createDefaultDemoSquad(user);
    await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(demo));
    return demo;
  }

  const current = await getMySquad();
  if (current && current.inviteCode === cleanCode) {
    return current;
  }

  // Mock finding or creating new squad for this code
  const squad: TrainingSquad = {
    id: `squad_code_${cleanCode}`,
    name: `Squad ${cleanCode}`,
    inviteCode: cleanCode,
    weeklyTargetSessions: 16,
    weekStartDate: getMondayISO(),
    createdBy: 'captain',
    createdAt: new Date().toISOString(),
    members: [
      {
        userId: 'u_cap',
        username: 'squad_captain',
        displayName: 'Squad Captain',
        role: 'owner',
        joinedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        weeklySessions: 3,
        bestPrThisWeek: null,
      },
      {
        userId: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        role: 'member',
        joinedAt: new Date().toISOString(),
        weeklySessions: 0,
        bestPrThisWeek: null,
      },
    ],
    recentActivity: [
      {
        id: `act_${Date.now()}`,
        userId: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        type: 'joined_squad',
        title: 'Joined the squad',
        detail: 'Ready to train together!',
        timestamp: new Date().toISOString(),
        cheersCount: 1,
        hasCheered: false,
      },
    ],
  };

  await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(squad));
  return squad;
};

export const leaveSquad = async (): Promise<void> => {
  await AsyncStorage.removeItem(SQUAD_STORAGE_KEY);
};

export const recordSquadWorkoutSession = async (params: {
  title: string;
  prHighlight?: string | null;
  durationMin?: number;
  user: { id: string; username: string; displayName: string };
}): Promise<TrainingSquad | null> => {
  const squad = await getMySquad();
  if (!squad) return null;

  const { title, prHighlight, durationMin, user } = params;

  // Increment user sessions
  let memberFound = false;
  squad.members = squad.members.map((m) => {
    if (m.userId === user.id) {
      memberFound = true;
      return {
        ...m,
        weeklySessions: m.weeklySessions + 1,
        bestPrThisWeek: prHighlight || m.bestPrThisWeek,
      };
    }
    return m;
  });

  if (!memberFound) {
    squad.members.push({
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      role: 'member',
      joinedAt: new Date().toISOString(),
      weeklySessions: 1,
      bestPrThisWeek: prHighlight || null,
    });
  }

  // Add activity
  squad.recentActivity.unshift({
    id: `act_${Date.now()}`,
    userId: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    type: prHighlight ? 'pr_set' : 'workout_completed',
    title: prHighlight ? `New PR: ${prHighlight}` : `Completed ${title}`,
    detail: durationMin ? `${durationMin} min workout` : undefined,
    timestamp: new Date().toISOString(),
    cheersCount: 1,
    hasCheered: true,
  });

  // Keep last 25 activities
  if (squad.recentActivity.length > 25) {
    squad.recentActivity = squad.recentActivity.slice(0, 25);
  }

  await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(squad));
  return squad;
};

export const cheerSquadActivity = async (activityId: string): Promise<TrainingSquad | null> => {
  const squad = await getMySquad();
  if (!squad) return null;

  squad.recentActivity = squad.recentActivity.map((act) => {
    if (act.id === activityId) {
      return {
        ...act,
        cheersCount: act.hasCheered ? act.cheersCount - 1 : act.cheersCount + 1,
        hasCheered: !act.hasCheered,
      };
    }
    return act;
  });

  await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(squad));
  return squad;
};
