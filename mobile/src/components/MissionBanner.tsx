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
        {/*
          The banner is a plain container with two separate buttons in it. It
          used to be one big button holding the dismiss button, and a button
          inside a button is invalid HTML on web — React warns about it on every
          load of Today, and screen readers announce the pair as one control.
        */}
        <View style={[styles.banner, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.badgeText, { color: colors.textFaint }]}>YOUR FOCUS</Text>
            <Pressable
              onPress={handleDismiss}
              style={styles.dismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Pressable
            onPress={handleOpenModal}
            style={({ pressed }) => [styles.contentCol, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Your focus is ${currentMission.name}. Change it.`}
          >
            <View style={styles.titleRow}>
              <Ionicons name={currentMission.icon} size={18} color={colors.text} />
              <Text style={[styles.title, { color: colors.text }]}>{currentMission.name}</Text>
            </View>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              You picked this during setup. Change it, or what Today shows first, any time.
            </Text>
            <View style={styles.footerRow}>
              <Text style={[styles.actionLink, { color: colors.text }]}>Change</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.text} />
            </View>
          </Pressable>
        </View>
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
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  // The full 44-point square: hitSlop is ignored on web.
  dismiss: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.sm,
  },
  contentCol: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  actionLink: {
    fontFamily: font.uiStrong,
    fontSize: 13,
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
    gap: 4,
    minHeight: 32,
  },
});
