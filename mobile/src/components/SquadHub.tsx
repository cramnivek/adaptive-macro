import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { confirm, notify } from '../dialog';
import { thud } from '../platform/haptics';
import {
  cheerSquadActivity,
  createDefaultDemoSquad,
  getMySquad,
  leaveSquad,
} from '../social/squads';
import type { TrainingSquad } from '../social/squadTypes';
import { font, radius, space, useTheme } from '../theme';
import { Card } from './Card';
import { CreateJoinSquadModal } from './CreateJoinSquadModal';
import { FadeIn } from './FadeIn';
import { Tappable } from './Tappable';
import { useApp } from '../state/AppStore';
import { getEventCopy } from '../copy/personality';

interface SquadHubProps {
  user: {
    id: string;
    username: string;
    displayName: string;
  };
}

const AVATAR_PALETTE = ['#00E5FF', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#3B82F6'];

const getAvatarColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const getInitials = (name?: string): string => {
  if (!name) return '🏋️';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export const SquadHub = ({ user }: SquadHubProps) => {
  const { colors } = useTheme();
  const { settings } = useApp();
  const [squad, setSquad] = useState<TrainingSquad | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const loadSquad = useCallback(async () => {
    setLoading(true);
    try {
      const current = await getMySquad(user);
      setSquad(current);
    } catch {
      setSquad(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadSquad();
  }, [loadSquad]);

  const handleCopyCode = async () => {
    if (!squad) return;
    thud('light');
    if (Clipboard?.setString) {
      Clipboard.setString(squad.inviteCode);
    }
    notify('Code Copied', `Invite code "${squad.inviteCode}" copied to clipboard.`);
  };

  const handleShareInvite = async () => {
    if (!squad) return;
    thud('light');
    try {
      await Share.share({
        message: `Join my Ascend training squad "${squad.name}"! Use squad invite code: ${squad.inviteCode}`,
      });
    } catch {
      handleCopyCode();
    }
  };

  const handleCheer = async (activityId: string) => {
    thud('light');
    const updated = await cheerSquadActivity(activityId);
    if (updated) setSquad(updated);
  };

  const handleLeave = async () => {
    if (!squad) return;
    const ok = await confirm({
      title: 'Leave Squad',
      message: `Are you sure you want to leave "${squad.name}"?`,
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (!ok) return;
    thud('heavy');
    await leaveSquad();
    setSquad(null);
    notify('Left Squad', 'You have left the squad.');
  };

  const handleJoinDemo = async () => {
    thud('heavy');
    const demo = createDefaultDemoSquad(user);
    setSquad(demo);
    notify('Welcome to Squad', 'Loaded demo squad "The Iron Club".');
  };

  if (loading) {
    return <ActivityIndicator color={colors.accent} style={{ padding: space.xl }} />;
  }

  // Empty state: User has not joined or created a squad yet
  if (!squad) {
    return (
      <FadeIn>
        <Card style={styles.emptyCard}>
          <View style={styles.emptyBadge}>
            <Ionicons name="shield-checkmark" size={16} color="#00E5FF" />
            <Text style={styles.emptyBadgeText}>TRAINING SQUADS</Text>
          </View>

          <Text style={[styles.emptyHeadline, { color: colors.text }]}>
            {getEventCopy('social.squad_empty_headline', { personality: settings.personality })}
          </Text>
          <Text style={styles.emptyDesc}>
            Team up with 3–6 lifters. Set a weekly session goal, stay accountable, and hype each other's PRs.
          </Text>

          <View style={styles.emptyActions}>
            <Tappable
              onPress={() => setModalOpen(true)}
              style={styles.primaryBtn}
            >
              <Ionicons name="add-circle" size={16} color="#050B14" />
              <Text style={styles.primaryBtnText}>START OR JOIN A SQUAD</Text>
            </Tappable>

            <Pressable onPress={handleJoinDemo} style={styles.secondaryDemoBtn}>
              <Ionicons name="flame" size={15} color="#FBBF24" />
              <Text style={styles.secondaryDemoBtnText}>Explore Demo Squad "The Iron Club"</Text>
            </Pressable>
          </View>
        </Card>

        <CreateJoinSquadModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSquadCreatedOrJoined={(s) => setSquad(s)}
          user={user}
        />
      </FadeIn>
    );
  }

  const totalSessionsCompleted = squad.members.reduce((sum, m) => sum + m.weeklySessions, 0);
  const percentComplete = Math.min(
    100,
    Math.round((totalSessionsCompleted / squad.weeklyTargetSessions) * 100),
  );

  return (
    <FadeIn>
      <View style={styles.container}>
        {/* Challenge Hero Header Card */}
        <View style={styles.heroBanner}>
          <View style={styles.bannerTop}>
            <View style={styles.bannerTagRow}>
              <View style={styles.squadBadge}>
                <Ionicons name="shield-checkmark" size={13} color="#00E5FF" />
                <Text style={styles.squadBadgeText}>ASCEND / SQUAD CHALLENGE</Text>
              </View>
              <Pressable onPress={handleCopyCode} style={styles.invitePill}>
                <Ionicons name="copy-outline" size={12} color="#00E5FF" />
                <Text style={styles.invitePillText}>CODE: {squad.inviteCode}</Text>
              </Pressable>
            </View>
            <Text style={styles.squadTitle}>{squad.name.toUpperCase()}</Text>
            <Text style={styles.weekTag}>This Week · Train together</Text>
          </View>

          {/* Big Progress Number Box */}
          <View style={styles.progressBox}>
            <View style={styles.progressStatRow}>
              <Text style={styles.progressMain}>
                {totalSessionsCompleted}
                <Text style={styles.progressTarget}> / {squad.weeklyTargetSessions}</Text>
              </Text>
              <View style={styles.pctPill}>
                <Text style={styles.pctText}>{percentComplete}%</Text>
              </View>
            </View>
            <Text style={styles.progressLabel}>Squad sessions completed</Text>

            {/* Progress Bar */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${percentComplete}%`, backgroundColor: percentComplete >= 100 ? '#10B981' : '#00E5FF' },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Members Contribution Roster */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="people" size={15} color="#00E5FF" />
              <Text style={styles.sectionTitle}>SQUAD ROSTER ({squad.members.length}/6)</Text>
            </View>
            <Pressable onPress={handleShareInvite} style={styles.inviteBtnSmall}>
              <Ionicons name="person-add" size={13} color="#00E5FF" />
              <Text style={styles.inviteBtnSmallText}>Invite</Text>
            </Pressable>
          </View>

          <View style={styles.membersList}>
            {squad.members.map((member, idx) => {
              const isMe = member.userId === user.id;
              const initials = getInitials(member.displayName || member.username);
              const avatarBg = getAvatarColor(member.username || member.userId);

              return (
                <View key={member.userId || idx} style={styles.memberRow}>
                  <View style={[styles.memberAvatar, { backgroundColor: avatarBg }]}>
                    <Text style={styles.memberAvatarText}>{initials}</Text>
                  </View>

                  <View style={styles.memberInfo}>
                    <View style={styles.memberNameRow}>
                      <Text style={[styles.memberName, isMe && { color: '#00E5FF' }]}>
                        {member.displayName} {isMe ? '(You)' : ''}
                      </Text>
                      {member.role === 'owner' && (
                        <View style={styles.ownerBadge}>
                          <Text style={styles.ownerBadgeText}>CAPTAIN</Text>
                        </View>
                      )}
                    </View>

                    {member.bestPrThisWeek ? (
                      <View style={styles.prBadge}>
                        <Ionicons name="trophy" size={11} color="#FBBF24" />
                        <Text style={styles.prBadgeText}>{member.bestPrThisWeek}</Text>
                      </View>
                    ) : (
                      <Text style={styles.memberHandle}>@{member.username}</Text>
                    )}
                  </View>

                  <View style={styles.memberScoreBox}>
                    <Text style={styles.memberSessionsNum}>{member.weeklySessions}</Text>
                    <Text style={styles.memberSessionsUnit}>sessions</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        {/* PR Celebrations & Squad Activity */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="flame" size={16} color="#FBBF24" />
              <Text style={styles.sectionTitle}>SQUAD PR CELEBRATIONS</Text>
            </View>
          </View>

          <View style={styles.activityList}>
            {squad.recentActivity.map((act) => (
              <View key={act.id} style={styles.activityCard}>
                <View style={styles.activityTop}>
                  <View style={styles.actUserRow}>
                    <View
                      style={[
                        styles.actAvatar,
                        { backgroundColor: getAvatarColor(act.username || act.userId) },
                      ]}
                    >
                      <Text style={styles.actAvatarText}>
                        {getInitials(act.displayName || act.username)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.actUserName}>{act.displayName}</Text>
                      <Text style={styles.actTitle}>{act.title}</Text>
                    </View>
                  </View>

                  {/* One-Tap Cheer Button */}
                  <Tappable
                    onPress={() => handleCheer(act.id)}
                    style={[
                      styles.cheerBtn,
                      act.hasCheered && styles.cheerBtnActive,
                    ]}
                  >
                    <Text style={styles.cheerEmoji}>🔥</Text>
                    <Text style={[styles.cheerCount, act.hasCheered && styles.cheerCountActive]}>
                      {act.cheersCount}
                    </Text>
                  </Tappable>
                </View>

                {act.detail && <Text style={styles.actDetail}>{act.detail}</Text>}
              </View>
            ))}
          </View>
        </Card>

        {/* Squad Footer Actions */}
        <View style={styles.footerRow}>
          <Pressable onPress={handleShareInvite} style={styles.footerAction}>
            <Ionicons name="share-social-outline" size={14} color="#00E5FF" />
            <Text style={styles.footerActionText}>Share Squad Invite Link</Text>
          </Pressable>

          <Pressable onPress={handleLeave} style={styles.footerDanger}>
            <Text style={styles.footerDangerText}>Leave Squad</Text>
          </Pressable>
        </View>
      </View>

      <CreateJoinSquadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSquadCreatedOrJoined={(s) => setSquad(s)}
        user={user}
      />
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: space.md,
  },
  emptyCard: {
    padding: space.lg,
    backgroundColor: '#0A111B',
    borderColor: '#1E293B',
    borderRadius: radius.md,
    gap: space.sm,
  },
  emptyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  emptyBadgeText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.1,
    color: '#00E5FF',
  },
  emptyHeadline: {
    fontFamily: font.display,
    fontSize: 18,
    marginTop: 4,
  },
  emptyDesc: {
    fontFamily: font.ui,
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  emptyActions: {
    marginTop: space.md,
    gap: space.sm,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00E5FF',
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  primaryBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    letterSpacing: 0.8,
    color: '#050B14',
  },
  secondaryDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  secondaryDemoBtnText: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#FBBF24',
  },

  // Active Squad Hero
  heroBanner: {
    backgroundColor: '#050D18',
    borderColor: '#112238',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.md,
  },
  bannerTop: {
    gap: 4,
  },
  bannerTagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  squadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  squadBadgeText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.1,
    color: '#00E5FF',
  },
  invitePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderColor: 'rgba(0, 229, 255, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  invitePillText: {
    fontFamily: font.figure,
    fontSize: 10,
    color: '#00E5FF',
    letterSpacing: 1,
  },
  squadTitle: {
    fontFamily: font.display,
    fontSize: 22,
    letterSpacing: 0.5,
    color: '#F8FAFC',
  },
  weekTag: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#94A3B8',
  },

  // Progress Box
  progressBox: {
    backgroundColor: '#0A1626',
    borderColor: '#142944',
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.md,
    gap: 6,
  },
  progressStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  progressMain: {
    fontFamily: font.display,
    fontSize: 32,
    color: '#F8FAFC',
  },
  progressTarget: {
    fontFamily: font.figure,
    fontSize: 20,
    color: '#64748B',
  },
  pctPill: {
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  pctText: {
    fontFamily: font.figure,
    fontSize: 13,
    color: '#00E5FF',
  },
  progressLabel: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#94A3B8',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#0F233A',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Sections
  sectionCard: {
    backgroundColor: '#070E1A',
    borderColor: '#142032',
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#121E2E',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.1,
    color: '#94A3B8',
  },
  inviteBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  inviteBtnSmallText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    color: '#00E5FF',
  },

  // Members
  membersList: {
    gap: space.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0E1724',
    gap: space.sm,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    color: '#050B14',
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    color: '#F8FAFC',
  },
  ownerBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  ownerBadgeText: {
    fontFamily: font.uiStrong,
    fontSize: 8,
    letterSpacing: 0.8,
    color: '#FBBF24',
  },
  memberHandle: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#64748B',
  },
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  prBadgeText: {
    fontFamily: font.figure,
    fontSize: 10,
    color: '#FBBF24',
  },
  memberScoreBox: {
    alignItems: 'flex-end',
  },
  memberSessionsNum: {
    fontFamily: font.display,
    fontSize: 15,
    color: '#00E5FF',
  },
  memberSessionsUnit: {
    fontFamily: font.ui,
    fontSize: 10,
    color: '#64748B',
  },

  // Activity Feed
  activityList: {
    gap: space.xs,
  },
  activityCard: {
    backgroundColor: '#0B1422',
    borderColor: '#162338',
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.sm,
    gap: 4,
  },
  activityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  actAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actAvatarText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    color: '#050B14',
  },
  actUserName: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    color: '#F8FAFC',
  },
  actTitle: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#94A3B8',
  },
  actDetail: {
    fontFamily: font.figure,
    fontSize: 11,
    color: '#00E5FF',
    marginLeft: 36,
  },
  cheerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#121F32',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  cheerBtnActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderColor: '#FBBF24',
    borderWidth: 1,
  },
  cheerEmoji: {
    fontSize: 13,
  },
  cheerCount: {
    fontFamily: font.figure,
    fontSize: 11,
    color: '#94A3B8',
  },
  cheerCountActive: {
    color: '#FBBF24',
  },

  // Footer Actions
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: 4,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerActionText: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#00E5FF',
  },
  footerDanger: {
    padding: 4,
  },
  footerDangerText: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#EF4444',
  },
});
