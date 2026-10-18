import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { thud } from '../platform/haptics';
import { createSquad, joinSquadByCode } from '../social/squads';
import type { TrainingSquad } from '../social/squadTypes';
import { font, radius, space, useTheme } from '../theme';
import { Tappable } from './Tappable';

interface CreateJoinSquadModalProps {
  open: boolean;
  onClose: () => void;
  onSquadCreatedOrJoined: (squad: TrainingSquad) => void;
  user: { id: string; username: string; displayName: string };
}

export const CreateJoinSquadModal = ({
  open,
  onClose,
  onSquadCreatedOrJoined,
  user,
}: CreateJoinSquadModalProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [target, setTarget] = useState(16);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Please enter a squad name.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      thud('heavy');
      const squad = await createSquad({
        name,
        weeklyTargetSessions: target,
        user,
      });
      onSquadCreatedOrJoined(squad);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create squad');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (overrideCode?: string) => {
    const codeToUse = (overrideCode || code).trim();
    if (!codeToUse) {
      setError('Please enter a squad code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      thud('heavy');
      const squad = await joinSquadByCode({
        inviteCode: codeToUse,
        user,
      });
      onSquadCreatedOrJoined(squad);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid squad code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark" size={14} color="#00E5FF" />
              <Text style={styles.badgeText}>ASCEND SQUADS (BETA)</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>
              {tab === 'create' ? 'Start a Training Squad' : 'Join a Training Squad'}
            </Text>
          </View>
          <Tappable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Tappable>
        </View>

        {/* Mode Switcher */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => {
              thud('light');
              setTab('create');
              setError(null);
            }}
            style={[styles.tabBtn, tab === 'create' && styles.tabBtnActive]}
          >
            <Ionicons
              name="add-circle-outline"
              size={15}
              color={tab === 'create' ? '#00E5FF' : colors.textMuted}
            />
            <Text style={[styles.tabBtnText, tab === 'create' && styles.tabBtnTextActive]}>
              Create Squad
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              thud('light');
              setTab('join');
              setError(null);
            }}
            style={[styles.tabBtn, tab === 'join' && styles.tabBtnActive]}
          >
            <Ionicons
              name="key-outline"
              size={15}
              color={tab === 'join' ? '#00E5FF' : colors.textMuted}
            />
            <Text style={[styles.tabBtnText, tab === 'join' && styles.tabBtnTextActive]}>
              Join with Code
            </Text>
          </Pressable>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={15} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {tab === 'create' ? (
          <View style={styles.form}>
            <Text style={styles.label}>SQUAD NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. The Iron Club, 6 AM Crew"
              placeholderTextColor="#64748B"
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              maxLength={40}
              autoFocus
            />

            <Text style={[styles.label, { marginTop: space.md }]}>WEEKLY SESSION TARGET</Text>
            <Text style={styles.hint}>Total workouts your squad aims to finish each week.</Text>
            <View style={styles.targetRow}>
              {[12, 16, 20, 24].map((t) => (
                <Pressable
                  key={t}
                  onPress={() => {
                    thud('light');
                    setTarget(t);
                  }}
                  style={[styles.targetPill, target === t && styles.targetPillActive]}
                >
                  <Text style={[styles.targetPillText, target === t && styles.targetPillTextActive]}>
                    {t} sessions
                  </Text>
                </Pressable>
              ))}
            </View>

            <Tappable
              onPress={handleCreate}
              style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#050B14" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#050B14" />
                  <Text style={styles.actionBtnText}>CREATE SQUAD</Text>
                </>
              )}
            </Tappable>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>ENTER 6-CHARACTER SQUAD CODE</Text>
            <TextInput
              value={code}
              onChangeText={(txt) => setCode(txt.toUpperCase())}
              placeholder="e.g. IRON26"
              placeholderTextColor="#64748B"
              style={[styles.input, styles.codeInput, { color: colors.text, borderColor: colors.border }]}
              maxLength={8}
              autoCapitalize="characters"
              autoFocus
            />

            <Tappable
              onPress={() => handleJoin()}
              style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#050B14" />
              ) : (
                <>
                  <Ionicons name="arrow-forward-circle" size={16} color="#050B14" />
                  <Text style={styles.actionBtnText}>JOIN SQUAD</Text>
                </>
              )}
            </Tappable>

            {/* Quick Demo Squad Option */}
            <Pressable
              onPress={() => handleJoin('IRON26')}
              style={styles.demoOption}
            >
              <Ionicons name="flame" size={14} color="#FBBF24" />
              <Text style={styles.demoOptionText}>
                Or tap here to join demo squad <Text style={{ fontWeight: 'bold' }}>"The Iron Club" (IRON26)</Text>
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 11, 20, 0.75)',
  },
  sheet: {
    marginTop: 'auto',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: 1,
    padding: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  titleGroup: {
    gap: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.1,
    color: '#00E5FF',
  },
  title: {
    fontFamily: font.display,
    fontSize: 18,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: radius.sm,
    padding: 3,
    marginBottom: space.lg,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  tabBtnActive: {
    backgroundColor: '#1E293B',
  },
  tabBtnText: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#94A3B8',
  },
  tabBtnTextActive: {
    fontFamily: font.uiStrong,
    color: '#F8FAFC',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.sm,
    marginBottom: space.md,
  },
  errorText: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#EF4444',
  },
  form: {
    gap: space.xs,
  },
  label: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1,
    color: '#64748B',
  },
  hint: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 6,
  },
  input: {
    fontFamily: font.ui,
    fontSize: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    backgroundColor: '#0A101D',
  },
  codeInput: {
    fontFamily: font.figure,
    fontSize: 18,
    letterSpacing: 3,
    textAlign: 'center',
  },
  targetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: space.lg,
  },
  targetPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: radius.sm,
    backgroundColor: '#0F172A',
  },
  targetPillActive: {
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
  },
  targetPillText: {
    fontFamily: font.figure,
    fontSize: 11,
    color: '#94A3B8',
  },
  targetPillTextActive: {
    fontFamily: font.uiStrong,
    color: '#00E5FF',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00E5FF',
    paddingVertical: 12,
    borderRadius: radius.sm,
    marginTop: space.md,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    letterSpacing: 0.8,
    color: '#050B14',
  },
  demoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  demoOptionText: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#94A3B8',
  },
});
