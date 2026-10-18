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
import { FEATURE_LIST } from '../features/featureInterests';
import { FeatureInterestModal } from './FeatureInterestModal';
import { FadeIn } from './FadeIn';

export const FeatureInterestOnboardingBanner = () => {
  const { colors } = useTheme();
  const { settings, updateSettings } = useApp();
  const [modalVisible, setModalVisible] = useState(false);

  // If already dismissed, do not show
  if (settings.featureOnboardingDismissed) {
    return null;
  }

  const handleDismiss = async () => {
    thud('light');
    await updateSettings({ featureOnboardingDismissed: true });
  };

  const handleOpenModal = () => {
    thud('heavy');
    setModalVisible(true);
  };

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
          accessibilityLabel="Customize your feature focus"
        >
          <View style={styles.headerRow}>
            <View style={styles.badgeLeft}>
              <Ionicons name="sparkles" size={13} color={colors.accent} />
              <Text style={[styles.badgeText, { color: colors.accent }]}>
                PERSONALIZE YOUR ASCEND
              </Text>
            </View>
            <Pressable
              onPress={handleDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss feature recommendation notice"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.contentCol}>
            <Text style={[styles.title, { color: colors.text }]}>
              Which features do you want to see?
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Tailor your Today dashboard, workouts, and AI nutrition focus to your exact goals.
            </Text>
          </View>

          {/* Mini emoji chips */}
          <View style={styles.chipsRow}>
            {FEATURE_LIST.map((feat) => {
              const active = settings.featureInterests.includes(feat.id);
              return (
                <View
                  key={feat.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? `${feat.accentColor}22` : colors.surface,
                      borderColor: active ? feat.accentColor : colors.border,
                    },
                  ]}
                >
                  <Text style={styles.chipEmoji}>{feat.emoji}</Text>
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? colors.text : colors.textMuted },
                    ]}
                  >
                    {feat.name.split(' ')[0]}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.footerRow}>
            <View style={[styles.actionBtn, { backgroundColor: colors.accent }]}>
              <Text style={[styles.actionBtnText, { color: colors.onFill }]}>
                CHOOSE FEATURES 🎯
              </Text>
              <Ionicons name="arrow-forward" size={14} color={colors.onFill} />
            </View>
          </View>
        </Pressable>
      </FadeIn>

      <FeatureInterestModal
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
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipEmoji: {
    fontSize: 11,
  },
  chipText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
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
