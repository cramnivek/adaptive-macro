import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { thud } from '../platform/haptics';
import { font, radius, space, useTheme } from '../theme';
import { useApp } from '../state/AppStore';
import { MISSIONS } from '../features/missionFocus';
import { MissionModal } from './MissionModal';
import { FadeIn } from './FadeIn';

export const MissionBanner = () => {
  const { colors } = useTheme();
  const { settings, updateSettings } = useApp();
  const [modalVisible, setModalVisible] = useState(false);

  // If already dismissed or onboarded, do not nag
  if (settings.missionOnboardingDismissed) {
    return null;
  }

  const handleDismiss = async () => {
    thud('light');
    await updateSettings({ missionOnboardingDismissed: true });
  };

  const handleOpenModal = () => {
    thud('heavy');
    setModalVisible(true);
  };

  const currentMission = MISSIONS[settings.userMission ?? 'hybrid'];

  return (
    <>
      <FadeIn>
        <Pressable
          onPress={handleOpenModal}
          style={({ pressed }) => [
            styles.banner,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.accent,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Customize your training mission"
        >
          <View style={styles.headerRow}>
            <View style={styles.badgeLeft}>
              <Ionicons name="sparkles" size={13} color={colors.accent} />
              <Text style={[styles.badgeText, { color: colors.accent }]}>
                TRAINING MISSION & SPOTLIGHT
              </Text>
            </View>
            <Pressable
              onPress={handleDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss mission banner"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.contentCol}>
            <Text style={[styles.title, { color: colors.text }]}>
              {currentMission.emoji} {currentMission.name}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Tailor your dashboard spotlight and AI coaching advice to your primary goal. All tools remain 100% active.
            </Text>
          </View>

          <View style={styles.footerRow}>
            <View style={[styles.actionBtn, { backgroundColor: colors.accent }]}>
              <Text style={[styles.actionBtnText, { color: colors.onFill }]}>
                CUSTOMIZE MISSION 🎯
              </Text>
              <Ionicons name="arrow-forward" size={14} color={colors.onFill} />
            </View>
          </View>
        </Pressable>
      </FadeIn>

      <MissionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  banner: {
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    gap: space.sm,
    marginBottom: space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  badgeText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  contentCol: {
    gap: 2,
  },
  title: {
    fontFamily: font.uiStrong,
    fontSize: 15,
    lineHeight: 20,
  },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 3,
    borderRadius: radius.pill,
  },
  actionBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1,
  },
});
