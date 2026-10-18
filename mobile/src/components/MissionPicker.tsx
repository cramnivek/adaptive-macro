import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { thud } from '../platform/haptics';
import { font, radius, space, useTheme } from '../theme';
import type { DashboardSpotlight, UserMission } from '../state/settings';
import {
  MISSION_LIST,
  SPOTLIGHT_OPTIONS,
  getMissionPraise,
  type MissionDefinition,
} from '../features/missionFocus';
import { Button } from './Controls';

export interface MissionPickerProps {
  selectedMission: UserMission;
  selectedSpotlight: DashboardSpotlight;
  onChangeMission: (mission: UserMission) => void;
  onChangeSpotlight: (spotlight: DashboardSpotlight) => void;
  onSave?: (mission: UserMission, spotlight: DashboardSpotlight) => void;
  isSaving?: boolean;
  saveButtonLabel?: string;
  style?: ViewStyle;
}

export const MissionPicker = ({
  selectedMission,
  selectedSpotlight,
  onChangeMission,
  onChangeSpotlight,
  onSave,
  isSaving = false,
  saveButtonLabel = 'LOCK IN MY MISSION 🚀',
  style,
}: MissionPickerProps) => {
  const { colors } = useTheme();
  const [mission, setMission] = useState<UserMission>(selectedMission);
  const [spotlight, setSpotlight] = useState<DashboardSpotlight>(selectedSpotlight);

  const handleSelectMission = (id: UserMission) => {
    thud('light');
    setMission(id);
    onChangeMission(id);
  };

  const handleSelectSpotlight = (id: DashboardSpotlight) => {
    thud('light');
    setSpotlight(id);
    onChangeSpotlight(id);
  };

  const handleSave = () => {
    thud('heavy');
    onSave?.(mission, spotlight);
  };

  const praise = getMissionPraise(mission);

  return (
    <View style={[styles.container, style]}>
      {/* Dynamic Motivation & Praise Banner */}
      <View
        style={[
          styles.praiseBox,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.praiseBadgeRow}>
          <Ionicons name="sparkles" size={13} color={colors.accent} />
          <Text style={[styles.praiseBadgeText, { color: colors.accent }]}>
            YOUR TRAINING MISSION
          </Text>
        </View>
        <Text style={[styles.praiseMessage, { color: colors.text }]}>
          {praise}
        </Text>
      </View>

      {/* Mission Cards Grid */}
      <View style={styles.missionsList}>
        {MISSION_LIST.map((item: MissionDefinition) => {
          const isSelected = mission === item.id;

          return (
            <Pressable
              key={item.id}
              onPress={() => handleSelectMission(item.id)}
              style={({ pressed }) => [
                styles.missionCard,
                {
                  backgroundColor: isSelected ? colors.surfaceRaised : colors.surface,
                  borderColor: isSelected ? item.accentColor : colors.border,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${item.name}: ${item.tagline}`}
            >
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.emojiBubble,
                    {
                      backgroundColor: `${item.accentColor}22`,
                      borderColor: `${item.accentColor}55`,
                    },
                  ]}
                >
                  <Text style={styles.emojiText}>{item.emoji}</Text>
                </View>

                <View style={styles.headerInfo}>
                  <Text
                    style={[
                      styles.badgeTag,
                      { color: isSelected ? item.accentColor : colors.textFaint },
                    ]}
                  >
                    {item.badge}
                  </Text>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {item.name}
                  </Text>
                </View>

                {/* Radio selection indicator */}
                <View
                  style={[
                    styles.radioCircle,
                    isSelected
                      ? {
                          backgroundColor: item.accentColor,
                          borderColor: item.accentColor,
                        }
                      : {
                          backgroundColor: 'transparent',
                          borderColor: colors.border,
                        },
                  ]}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  )}
                </View>
              </View>

              <Text style={[styles.tagline, { color: colors.textMuted }]}>
                {item.tagline}
              </Text>
              <Text style={[styles.desc, { color: colors.textFaint }]}>
                {item.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Dashboard Spotlight Selector */}
      <View style={styles.spotlightSection}>
        <View style={styles.spotlightHeader}>
          <Text style={[styles.spotlightTitle, { color: colors.text }]}>
            Home Screen Spotlight
          </Text>
          <Text style={[styles.spotlightSubtitle, { color: colors.textMuted }]}>
            Choose what your daily dashboard leads with.
          </Text>
        </View>

        <View style={styles.spotlightRow}>
          {SPOTLIGHT_OPTIONS.map((opt) => {
            const isSelected = spotlight === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => handleSelectSpotlight(opt.id)}
                style={({ pressed }) => [
                  styles.spotlightPill,
                  {
                    backgroundColor: isSelected ? colors.text : colors.surfaceRaised,
                    borderColor: isSelected ? colors.text : colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <Text style={styles.spotlightEmoji}>{opt.emoji}</Text>
                <Text
                  style={[
                    styles.spotlightText,
                    { color: isSelected ? colors.background : colors.text },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Guarantee Badge */}
      <View style={[styles.guaranteeBox, { backgroundColor: colors.surfaceRaised }]}>
        <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
        <Text style={[styles.guaranteeText, { color: colors.textMuted }]}>
          All features (3D Kinematics, Scale Weight, Story Stickers, AI Coach & DRI Panel) are always 100% active and unlocked.
        </Text>
      </View>

      {/* Save Button */}
      {onSave && (
        <View style={styles.saveContainer}>
          <Button
            label={saveButtonLabel}
            onPress={handleSave}
            disabled={isSaving}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: space.md,
  },
  praiseBox: {
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.xs,
  },
  praiseBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  praiseBadgeText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  praiseMessage: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    lineHeight: 18,
  },
  missionsList: {
    gap: space.sm,
  },
  missionCard: {
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    gap: space.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  emojiBubble: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 18,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  badgeTag: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    letterSpacing: 1,
  },
  cardTitle: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    lineHeight: 18,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  desc: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 16,
  },
  spotlightSection: {
    marginTop: space.xs,
    gap: space.xs + 2,
  },
  spotlightHeader: {
    gap: 2,
  },
  spotlightTitle: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
  spotlightSubtitle: {
    fontFamily: font.ui,
    fontSize: 11,
  },
  spotlightRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  spotlightPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  spotlightEmoji: {
    fontSize: 12,
  },
  spotlightText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
  },
  guaranteeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm + 2,
    borderRadius: radius.lg,
  },
  guaranteeText: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  saveContainer: {
    marginTop: space.xs,
  },
});
