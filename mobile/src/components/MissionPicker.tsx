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
  /** When true, renders a clean streamlined view tailored for onboarding */
  compact?: boolean;
  /** When true, hides the dynamic praise header */
  hidePraiseBox?: boolean;
}

export const MissionPicker = ({
  selectedMission,
  selectedSpotlight,
  onChangeMission,
  onChangeSpotlight,
  onSave,
  isSaving = false,
  saveButtonLabel = 'Save',
  style,
  compact = false,
  hidePraiseBox = false,
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
      {!hidePraiseBox && !compact && (
        <View
          style={[
            styles.praiseBox,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.praiseBadgeText, { color: colors.textFaint }]}>YOUR FOCUS</Text>
          <Text style={[styles.praiseMessage, { color: colors.text }]}>
            {praise}
          </Text>
        </View>
      )}

      {/* Mission Cards Grid */}
      <View style={[styles.missionsList, compact && styles.compactMissionsList]}>
        {MISSION_LIST.map((item: MissionDefinition) => {
          const isSelected = mission === item.id;

          return (
            <Pressable
              key={item.id}
              onPress={() => handleSelectMission(item.id)}
              style={({ pressed }) => [
                styles.missionCard,
                compact && styles.compactMissionCard,
                {
                  backgroundColor: isSelected ? colors.surfaceRaised : colors.surface,
                  borderColor: isSelected ? colors.accent : colors.border,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${item.name}: ${item.tagline}`}
            >
              <View style={[styles.cardHeader, compact && styles.compactCardHeader]}>
                <View
                  style={[
                    styles.glyphBox,
                    compact && styles.compactGlyphBox,
                    { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={compact ? 16 : 18}
                    color={isSelected ? colors.text : colors.textMuted}
                  />
                </View>

                <View style={styles.headerInfo}>
                  <Text
                    style={[
                      styles.cardTitle,
                      compact && styles.compactCardTitle,
                      { color: colors.text },
                    ]}
                  >
                    {item.name}
                  </Text>
                  {compact && (
                    <Text style={[styles.compactTagline, { color: colors.textMuted }]}>
                      {item.tagline}
                    </Text>
                  )}
                </View>

                {/* Radio selection indicator */}
                <View
                  style={[
                    styles.radioCircle,
                    compact && styles.compactRadioCircle,
                    isSelected
                      ? {
                          backgroundColor: colors.accent,
                          borderColor: colors.accent,
                        }
                      : {
                          backgroundColor: 'transparent',
                          borderColor: colors.border,
                        },
                  ]}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={compact ? 12 : 14} color={colors.onFill} />
                  )}
                </View>
              </View>

              {!compact && (
                <>
                  <Text style={[styles.tagline, { color: colors.textMuted }]}>
                    {item.tagline}
                  </Text>
                  <Text style={[styles.desc, { color: colors.textFaint }]}>
                    {item.description}
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Dashboard Spotlight Selector */}
      {!compact && (
        <View style={styles.spotlightSection}>
          <View style={styles.spotlightHeader}>
            <Text style={[styles.spotlightTitle, { color: colors.text }]}>
              Home screen
            </Text>
            <Text style={[styles.spotlightSubtitle, { color: colors.textMuted }]}>
              What Today shows first.
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
      )}

      {/* Said plainly because it is the question a picker like this raises:
          does choosing one switch something else off? It does not. */}
      {!compact && (
        <Text style={[styles.guaranteeText, { color: colors.textFaint }]}>
          Every feature stays on whichever you pick.
        </Text>
      )}

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
  compactMissionsList: {
    gap: space.xs + 2,
  },
  missionCard: {
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    gap: space.xs,
  },
  compactMissionCard: {
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    gap: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  compactCardHeader: {
    gap: space.sm,
  },
  glyphBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactGlyphBox: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    lineHeight: 18,
  },
  compactCardTitle: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    lineHeight: 18,
  },
  compactTagline: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 15,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
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
  spotlightText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
  },
  guaranteeText: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 16,
  },
  saveContainer: {
    marginTop: space.xs,
  },
});
