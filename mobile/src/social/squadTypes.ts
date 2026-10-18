export interface SquadMember {
  userId: string;
  username: string;
  displayName: string;
  role: 'owner' | 'member';
  joinedAt: string;
  weeklySessions: number;
  bestPrThisWeek?: string | null;
  avatarUrl?: string | null;
}

export interface SquadActivity {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  type: 'workout_completed' | 'pr_set' | 'joined_squad';
  title: string;
  detail?: string | null;
  timestamp: string;
  cheersCount: number;
  hasCheered: boolean;
  avatarUrl?: string | null;
}

export interface TrainingSquad {
  id: string;
  name: string;
  inviteCode: string;
  weeklyTargetSessions: number;
  weekStartDate: string;
  createdBy: string;
  createdAt: string;
  members: SquadMember[];
  recentActivity: SquadActivity[];
}
