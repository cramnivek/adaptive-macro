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
import type { FeatureInterest } from '../state/settings';
import {
  FEATURE_LIST,
  FEATURE_PRESETS,
  getFeatureReaction,
  type FeatureDefinition,
  type FeaturePreset,
} from '../features/featureInterests';
import { Button } from './Controls';

export interface FeatureInterestPickerProps {
  selectedInterests: FeatureInterest[];
  onChange: (interests: FeatureInterest[]) => void;
  onSave?: (interests: FeatureInterest[]) => void;
  isSaving?: boolean;
  saveButtonLabel?: string;
  showPresets?: boolean;
  style?: ViewStyle;
}

export const FeatureInterestPicker = ({
  selectedInterests,
  onChange,
  onSave,
  isSaving = false,
  saveButtonLabel = 'SAVE & PERSONALIZE DASHBOARD',
  showPresets = true,
  style,
}: FeatureInterestPickerProps) => {
  const { colors } = useTheme();
  const [internalSelected, setInternalSelected] = useState<FeatureInterest[]>(selectedInterests);

  const currentSelected = internalSelected;

  const toggleFeature = (id: FeatureInterest) => {
    thud('light');
    let next: FeatureInterest[];
    if (currentSelected.includes(id)) {
      // Keep at least one feature selected so dashboard is never completely empty
      if (currentSelected.length <= 1) {
        return;
      }
      next = currentSelected.filter((f) => f !== id);
    } else {
      next = [...currentSelected, id];
    }
    setInternalSelected(next);
    onChange(next);
  };

  const applyPreset = (preset: FeaturePreset) => {
    thud('heavy');
    setInternalSelected(preset.features);
    onChange(preset.features);
  };

  const handleSave = () => {
    thud('heavy');
    onSave?.(currentSelected);
  };

  const reaction = getFeatureReaction(currentSelected.length, currentSelected);

  return (
    <View style={[styles.container, style]}>
      {/* Quick Presets Bar */}
      {showPresets && (
        <View style={styles.presetSection}>
          <Text style={[styles.presetSectionLabel, { color: colors.textFaint }]}>
            QUICK PRESETS
          </Text>
          <View style={styles.presetRow}>
            {FEATURE_PRESETS.map((preset) => {
              const isMatch =
                preset.features.length === currentSelected.length &&
                preset.features.every((f) => currentSelected.includes(f));

              return (
                <Pressable
                  key={preset.id}
                  onPress={() => applyPreset(preset)}
                  style={({ pressed }) => [
                    styles.presetPill,
                    {
                      backgroundColor: isMatch ? colors.text : colors.surfaceRaised,
                      borderColor: isMatch ? colors.text : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Apply preset ${preset.name}`}
                >
                  <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                  <Text
                    style={[
                      styles.presetText,
                      { color: isMatch ? colors.background : colors.text },
                    ]}
                  >
                    {preset.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Dynamic Personality & Status Banner */}
      <View
        style={[
          styles.reactionBox,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.reactionHeader}>
          <View style={styles.reactionCountBadge}>
            <Text style={[styles.reactionCountText, { color: colors.accent }]}>
              {currentSelected.length} OF 6 ENABLED
            </Text>
          </View>
          {currentSelected.length === 6 && (
            <View style={[styles.allInBadge, { backgroundColor: '#10B98120' }]}>
              <Text style={styles.allInText}>ALL-IN ⚡</Text>
            </View>
          )}
        </View>
        <Text style={[styles.reactionMessage, { color: colors.text }]}>
          {reaction}
        </Text>
      </View>

      {/* Feature Cards Grid */}
      <View style={styles.cardsGrid}>
        {FEATURE_LIST.map((feature: FeatureDefinition) => {
          const isSelected = currentSelected.includes(feature.id);

          return (
            <Pressable
              key={feature.id}
              onPress={() => toggleFeature(feature.id)}
              style={({ pressed }) => [
                styles.featureCard,
                {
                  backgroundColor: isSelected ? colors.surfaceRaised : colors.surface,
                  borderColor: isSelected ? feature.accentColor : colors.border,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                },
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${feature.name}: ${feature.tagline}`}
            >
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.iconBubble,
                    {
                      backgroundColor: `${feature.accentColor}22`,
                      borderColor: `${feature.accentColor}55`,
                    },
                  ]}
                >
                  <Ionicons
                    name={feature.icon}
                    size={20}
                    color={feature.accentColor}
                  />
                </View>

                <View style={styles.headerInfo}>
                  <View style={styles.tagRow}>
                    <Text
                      style={[
                        styles.badgeTag,
                        { color: isSelected ? feature.accentColor : colors.textFaint },
                      ]}
                    >
                      {feature.badge}
                    </Text>
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {feature.emoji} {feature.name}
                  </Text>
                </View>

                {/* Checkbox indicator */}
                <View
                  style={[
                    styles.checkbox,
                    isSelected
                      ? {
                          backgroundColor: feature.accentColor,
                          borderColor: feature.accentColor,
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
                {feature.tagline}
              </Text>

              <Text style={[styles.desc, { color: colors.textFaint }]}>
                {feature.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Save Action Button */}
      {onSave && (
        <View style={styles.saveContainer}>
          <Button
            label={saveButtonLabel}
            onPress={handleSave}
            disabled={isSaving || currentSelected.length === 0}
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
  presetSection: {
    gap: space.xs,
  },
  presetSectionLabel: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  presetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetEmoji: {
    fontSize: 12,
  },
  presetText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
  reactionBox: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.xs,
  },
  reactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reactionCountBadge: {
    alignSelf: 'flex-start',
  },
  reactionCountText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  allInBadge: {
    paddingHorizontal: space.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  allInText: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    color: '#10B981',
    letterSpacing: 1,
  },
  reactionMessage: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    lineHeight: 18,
  },
  cardsGrid: {
    gap: space.sm,
  },
  featureCard: {
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
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  tagRow: {
    flexDirection: 'row',
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
  checkbox: {
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
  saveContainer: {
    marginTop: space.sm,
  },
});
