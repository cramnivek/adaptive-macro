import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayISO } from '@adaptive-macros/engine';
import { supabase } from './client';
import { messageFor } from './errors';
import type { SquadActivity, SquadMember, TrainingSquad } from './squadTypes';

export const SQUAD_STORAGE_KEY = 'ascend_user_squad';

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
      weeklySessions: 0,
      bestPrThisWeek: null,
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

/**
 * Resolves the authenticated user's ID from Supabase session, or caller param.
 */
const getAuthUserId = async (user?: { id: string }): Promise<string | null> => {
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) return data.session.user.id;
    } catch {
      // Offline or session read failure
    }
  }
  return user?.id ?? null;
};

/**
 * Fetches the user's active training squad.
 * Queries Supabase when online and signed in; falls back to AsyncStorage cache.
 */
export const getMySquad = async (user?: {
  id: string;
  username: string;
  displayName: string;
}): Promise<TrainingSquad | null> => {
  if (supabase) {
    try {
      const authUserId = await getAuthUserId(user);
      if (authUserId) {
        // 1. Check user membership
        const { data: memberRows, error: mErr } = await supabase
          .from('squad_members')
          .select('squad_id, role, joined_at')
          .eq('user_id', authUserId)
          .limit(1);

        if (!mErr && memberRows && memberRows.length > 0) {
          const squadId = memberRows[0].squad_id;

          // 2. Fetch squad details
          const { data: squadRow, error: sErr } = await supabase
            .from('squads')
            .select('id, name, invite_code, weekly_target, created_by, created_at')
            .eq('id', squadId)
            .single();

          if (!sErr && squadRow) {
            // 3. Fetch all members
            const { data: allMembers } = await supabase
              .from('squad_members')
              .select('squad_id, user_id, role, joined_at')
              .eq('squad_id', squadId);

            const memberUserIds = (allMembers ?? []).map((m) => m.user_id);
            const profilesMap = new Map<string, { username: string; display_name: string }>();

            if (memberUserIds.length > 0) {
              const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, display_name')
                .in('id', memberUserIds);

              (profiles ?? []).forEach((p) => {
                profilesMap.set(p.id, { username: p.username, display_name: p.display_name });
              });
            }

            // 4. Fetch recent checkins
            const weekStart = getMondayISO();
            const { data: checkinRows } = await supabase
              .from('squad_checkins')
              .select('id, squad_id, user_id, workout_id, performed_on, pr_highlight, created_at')
              .eq('squad_id', squadId)
              .order('created_at', { ascending: false })
              .limit(30);

            // 5. Fetch cheers for checkins
            const checkinIds = (checkinRows ?? []).map((c) => c.id);
            let cheerRows: { checkin_id: string; user_id: string }[] = [];
            if (checkinIds.length > 0) {
              const { data: cheers } = await supabase
                .from('squad_cheers')
                .select('checkin_id, user_id')
                .in('checkin_id', checkinIds);
              cheerRows = cheers ?? [];
            }

            // Build members roster
            const members: SquadMember[] = (allMembers ?? []).map((m) => {
              const p = profilesMap.get(m.user_id);
              const memberWeekCheckins = (checkinRows ?? []).filter(
                (c) => c.user_id === m.user_id && c.performed_on >= weekStart,
              );
              const prCheckin = memberWeekCheckins.find((c) => Boolean(c.pr_highlight));
              return {
                userId: m.user_id,
                username: p?.username ?? (m.user_id === authUserId && user?.username ? user.username : 'lifter'),
                displayName:
                  p?.display_name ?? (m.user_id === authUserId && user?.displayName ? user.displayName : 'Lifter'),
                role: m.role as 'owner' | 'member',
                joinedAt: m.joined_at,
                weeklySessions: memberWeekCheckins.length,
                bestPrThisWeek: prCheckin?.pr_highlight ?? null,
              };
            });

            // Sort roster: owners first, then most sessions
            members.sort((a, b) => {
              if (a.role === 'owner' && b.role !== 'owner') return -1;
              if (b.role === 'owner' && a.role !== 'owner') return 1;
              return b.weeklySessions - a.weeklySessions;
            });

            // Build recent activities
            const recentActivity: SquadActivity[] = (checkinRows ?? []).map((c) => {
              const p = profilesMap.get(c.user_id);
              const matchingCheers = cheerRows.filter((ch) => ch.checkin_id === c.id);
              const hasCheered = matchingCheers.some((ch) => ch.user_id === authUserId);
              return {
                id: c.id,
                userId: c.user_id,
                username: p?.username ?? 'lifter',
                displayName: p?.display_name ?? 'Lifter',
                type: c.pr_highlight ? 'pr_set' : 'workout_completed',
                title: c.pr_highlight ? `New PR: ${c.pr_highlight}` : 'Completed workout',
                detail: c.performed_on ? `Trained on ${c.performed_on}` : undefined,
                timestamp: c.created_at,
                cheersCount: matchingCheers.length,
                hasCheered,
              };
            });

            const squad: TrainingSquad = {
              id: squadRow.id,
              name: squadRow.name,
              inviteCode: squadRow.invite_code,
              weeklyTargetSessions: squadRow.weekly_target,
              weekStartDate: weekStart,
              createdBy: squadRow.created_by,
              createdAt: squadRow.created_at,
              members,
              recentActivity,
            };

            await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(squad));
            return squad;
          }
        } else if (!mErr && (!memberRows || memberRows.length === 0)) {
          // If local storage has a real squad (not IRON26 demo), clear it since user left on server
          const raw = await AsyncStorage.getItem(SQUAD_STORAGE_KEY);
          if (raw) {
            try {
              const cached = JSON.parse(raw) as TrainingSquad;
              if (cached.inviteCode !== 'IRON26') {
                await AsyncStorage.removeItem(SQUAD_STORAGE_KEY);
                return null;
              }
            } catch {
              // Ignore JSON parse error
            }
          }
        }
      }
    } catch {
      // Offline or network error: fall through to AsyncStorage cache
    }
  }

  // AsyncStorage fallback
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

/**
 * Creates a new training squad on Supabase (with offline/local fallback).
 */
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

  if (supabase) {
    try {
      const authUserId = await getAuthUserId(user);
      if (authUserId) {
        // Clear any previous membership first to enforce single squad per user
        await supabase.from('squad_members').delete().eq('user_id', authUserId);

        let inviteCode = generateInviteCode();
        let squadRow = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, error } = await supabase
            .from('squads')
            .insert({
              name: trimmedName,
              invite_code: inviteCode,
              weekly_target: target,
              created_by: authUserId,
            })
            .select('id, name, invite_code, weekly_target, created_by, created_at')
            .single();

          if (!error && data) {
            squadRow = data;
            break;
          }
          inviteCode = generateInviteCode();
        }

        if (squadRow) {
          const { error: memberErr } = await supabase.from('squad_members').insert({
            squad_id: squadRow.id,
            user_id: authUserId,
            role: 'owner',
          });

          if (memberErr) throw new Error(messageFor(memberErr));

          const liveSquad = await getMySquad(user);
          if (liveSquad) return liveSquad;
        }
      }
    } catch (err) {
      if (err instanceof Error && !err.message.includes('reach the server')) {
        throw err;
      }
      // If network unreachable, allow single-user local fallback below
    }
  }

  // Local fallback: user-only squad without fabricated mock members
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

/**
 * Joins an existing training squad by its invite code.
 * Requires live network connection and authentic Supabase squad lookup.
 */
export const joinSquadByCode = async (params: {
  inviteCode: string;
  user: { id: string; username: string; displayName: string };
}): Promise<TrainingSquad> => {
  const { inviteCode, user } = params;
  const cleanCode = inviteCode.trim().toUpperCase();
  if (cleanCode.length < 4 || cleanCode.length > 8) {
    throw new Error('Please enter a valid 6-character squad code.');
  }

  // Demo squad shortcut
  if (cleanCode === 'IRON26') {
    const demo = createDefaultDemoSquad(user);
    await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(demo));
    return demo;
  }

  if (!supabase) {
    throw new Error('Unable to join squad. An internet connection is required to join a live squad.');
  }

  const authUserId = await getAuthUserId(user);
  if (!authUserId) {
    throw new Error('Please sign in to join a training squad.');
  }

  // 1. Find squad by invite code
  const { data: foundSquad, error: findErr } = await supabase
    .from('squads')
    .select('id, name, invite_code, weekly_target, created_by, created_at')
    .eq('invite_code', cleanCode)
    .maybeSingle();

  if (findErr) throw new Error(messageFor(findErr));
  if (!foundSquad) {
    throw new Error(`Squad with code "${cleanCode}" was not found. Please verify the code.`);
  }

  // 2. Check 6-member squad capacity
  const { count } = await supabase
    .from('squad_members')
    .select('*', { count: 'exact', head: true })
    .eq('squad_id', foundSquad.id);

  if (count !== null && count >= 6) {
    throw new Error(`Squad "${foundSquad.name}" is already at full capacity (6 lifters max).`);
  }

  // 3. Clear any existing membership in another squad before joining
  await supabase.from('squad_members').delete().eq('user_id', authUserId);

  // 4. Insert membership into the target squad
  const { error: joinErr } = await supabase.from('squad_members').insert({
    squad_id: foundSquad.id,
    user_id: authUserId,
    role: 'member',
  });

  if (joinErr) {
    if (joinErr.message?.includes('squad_full') || joinErr.code === 'P0001') {
      throw new Error(`Squad "${foundSquad.name}" is already at full capacity (6 lifters max).`);
    }
    throw new Error(messageFor(joinErr));
  }

  const liveSquad = await getMySquad(user);
  if (!liveSquad) {
    throw new Error('Joined squad, but could not load squad details. Please refresh.');
  }
  return liveSquad;
};

/**
 * Leaves the current training squad.
 */
export const leaveSquad = async (user?: { id: string }): Promise<void> => {
  if (supabase) {
    try {
      const authUserId = await getAuthUserId(user);
      if (authUserId) {
        await supabase.from('squad_members').delete().eq('user_id', authUserId);
      }
    } catch {
      // Ignore network errors on leave
    }
  }
  await AsyncStorage.removeItem(SQUAD_STORAGE_KEY);
};

/**
 * Records a finished workout session to the squad's shared check-in feed.
 */
export const recordSquadWorkoutSession = async (params: {
  title: string;
  prHighlight?: string | null;
  durationMin?: number;
  workoutId?: string;
  user: { id: string; username: string; displayName: string };
}): Promise<TrainingSquad | null> => {
  const { title, prHighlight, durationMin, workoutId, user } = params;

  if (supabase) {
    try {
      const authUserId = await getAuthUserId(user);
      if (authUserId) {
        const { data: memberRows } = await supabase
          .from('squad_members')
          .select('squad_id')
          .eq('user_id', authUserId)
          .limit(1);

        if (memberRows && memberRows.length > 0) {
          const squadId = memberRows[0].squad_id;
          await supabase.from('squad_checkins').insert({
            squad_id: squadId,
            user_id: authUserId,
            workout_id: workoutId || `workout_${Date.now()}`,
            performed_on: todayISO(),
            pr_highlight: prHighlight?.slice(0, 120) || null,
          });

          const refreshed = await getMySquad(user);
          if (refreshed) return refreshed;
        }
      }
    } catch {
      // Fall through to local fallback
    }
  }

  // Local fallback
  const squad = await getMySquad(user);
  if (!squad) return null;

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

  if (squad.recentActivity.length > 25) {
    squad.recentActivity = squad.recentActivity.slice(0, 25);
  }

  await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(squad));
  return squad;
};

/**
 * Toggles a cheer on a squad check-in / activity item.
 */
export const cheerSquadActivity = async (
  activityId: string,
  user?: { id: string },
): Promise<TrainingSquad | null> => {
  if (supabase) {
    try {
      const authUserId = await getAuthUserId(user);
      if (authUserId) {
        // Check if cheer exists for this checkin
        const { data: existingCheer } = await supabase
          .from('squad_cheers')
          .select('id')
          .eq('checkin_id', activityId)
          .eq('user_id', authUserId)
          .maybeSingle();

        if (existingCheer) {
          await supabase.from('squad_cheers').delete().eq('id', existingCheer.id);
        } else {
          // Find checkin to get squad_id
          const { data: checkin } = await supabase
            .from('squad_checkins')
            .select('squad_id')
            .eq('id', activityId)
            .maybeSingle();

          if (checkin) {
            await supabase.from('squad_cheers').insert({
              squad_id: checkin.squad_id,
              checkin_id: activityId,
              user_id: authUserId,
            });
          }
        }

        const refreshed = await getMySquad();
        if (refreshed) return refreshed;
      }
    } catch {
      // Fall through to local fallback
    }
  }

  // Local fallback
  const squad = await getMySquad();
  if (!squad) return null;

  squad.recentActivity = squad.recentActivity.map((act) => {
    if (act.id === activityId) {
      return {
        ...act,
        cheersCount: act.hasCheered ? Math.max(0, act.cheersCount - 1) : act.cheersCount + 1,
        hasCheered: !act.hasCheered,
      };
    }
    return act;
  });

  await AsyncStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(squad));
  return squad;
};
