import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { thud } from '../platform/haptics';
import { pickAvatarSource, PRESET_AVATARS } from '../social/avatars';
import { font, radius, space, useTheme } from '../theme';
import { AvatarCropper } from './AvatarCropper';
import { Tappable } from './Tappable';
import { UserAvatar } from './UserAvatar';

export interface AvatarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  currentAvatarUrl?: string | null;
  onSelectAvatar: (avatarUrl: string | null) => void;
  username?: string;
  name?: string;
}

export const AvatarPickerModal = ({
  visible,
  onClose,
  currentAvatarUrl,
  onSelectAvatar,
  username,
  name,
}: AvatarPickerModalProps) => {
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  /** A photo picked and waiting to be positioned; the sheet shows the cropper while it is set. */
  const [source, setSource] = useState<{ uri: string; width: number; height: number } | null>(null);

  const handlePickPhoto = async (useCamera: boolean) => {
    thud('light');
    setPicking(true);
    try {
      const picked = await pickAvatarSource(useCamera);
      if (picked) setSource(picked);
    } catch {
      thud('light');
    } finally {
      setPicking(false);
    }
  };

  const close = () => {
    setSource(null);
    onClose();
  };

  const handleSelectPreset = (presetId: string) => {
    thud('light');
    onSelectAvatar(presetId);
    onClose();
  };

  const handleReset = () => {
    thud('light');
    onSelectAvatar(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Choose Avatar</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Select an archetype badge or upload a custom photo
              </Text>
            </View>
            <Tappable
              onPress={() => {
                thud('light');
                close();
              }}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.closeBtn, { backgroundColor: colors.surfaceRaised }]}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Tappable>
          </View>

          {source ? (
            <View style={styles.scrollContent}>
              <AvatarCropper
                photo={source}
                onCancel={() => setSource(null)}
                onDone={(avatarUrl) => {
                  thud('heavy');
                  onSelectAvatar(avatarUrl);
                  close();
                }}
              />
            </View>
          ) : (
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Current Avatar Preview */}
            <View style={styles.previewRow}>
              <UserAvatar
                avatarUrl={currentAvatarUrl}
                username={username}
                name={name}
                size="lg"
                ring
              />
              <View style={styles.previewInfo}>
                <Text style={[styles.previewName, { color: colors.text }]}>
                  {name || username || 'Profile Avatar'}
                </Text>
                <Text style={[styles.previewSub, { color: colors.textMuted }]}>
                  {currentAvatarUrl?.startsWith('data:') || currentAvatarUrl?.startsWith('http')
                    ? 'Custom Photo'
                    : currentAvatarUrl?.startsWith('preset:')
                      ? 'Fitness Archetype'
                      : 'Initials Monogram'}
                </Text>
              </View>
            </View>

            {/* Custom Photo Options */}
            <Text style={[styles.sectionHeading, { color: colors.textFaint }]}>CUSTOM PHOTO</Text>
            <View style={styles.actionGrid}>
              <Tappable
                onPress={() => void handlePickPhoto(true)}
                disabled={picking}
                accessibilityRole="button"
                accessibilityLabel="Take Photo"
                style={[styles.actionButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                {picking ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Ionicons name="camera" size={22} color={colors.accent} />
                    <Text style={[styles.actionButtonText, { color: colors.text }]}>Take Photo</Text>
                  </>
                )}
              </Tappable>

              <Tappable
                onPress={() => void handlePickPhoto(false)}
                disabled={picking}
                accessibilityRole="button"
                accessibilityLabel="Choose from Library"
                style={[styles.actionButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                {picking ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Ionicons name="images" size={22} color={colors.accent} />
                    <Text style={[styles.actionButtonText, { color: colors.text }]}>Library</Text>
                  </>
                )}
              </Tappable>

              <Tappable
                onPress={handleReset}
                disabled={picking}
                accessibilityRole="button"
                accessibilityLabel="Reset to initials"
                style={[styles.actionButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <Ionicons name="refresh" size={22} color={colors.textMuted} />
                <Text style={[styles.actionButtonText, { color: colors.textMuted }]}>Initials</Text>
              </Tappable>
            </View>

            {/* Fitness Presets */}
            <Text style={[styles.sectionHeading, { color: colors.textFaint }]}>FITNESS ARCHETYPES</Text>
            <View style={styles.presetsGrid}>
              {PRESET_AVATARS.map((preset) => {
                const isSelected = currentAvatarUrl === preset.id;
                return (
                  <Tappable
                    key={preset.id}
                    onPress={() => handleSelectPreset(preset.id)}
                    accessibilityRole="button"
                    accessibilityLabel={preset.label}
                    style={[
                      styles.presetCard,
                      {
                        backgroundColor: colors.surfaceRaised,
                        borderColor: isSelected ? colors.accent : colors.border,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.presetIconBox,
                        {
                          backgroundColor: preset.bg,
                          borderColor: preset.color + '66',
                        },
                      ]}
                    >
                      <Ionicons name={preset.icon} size={24} color={preset.color} />
                    </View>
                    <Text
                      style={[
                        styles.presetLabel,
                        {
                          color: isSelected ? colors.accent : colors.text,
                          fontFamily: isSelected ? font.uiStrong : font.ui,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {preset.label}
                    </Text>
                    {isSelected && (
                      <View style={[styles.checkBadge, { backgroundColor: colors.accent }]}>
                        <Ionicons name="checkmark" size={10} color={colors.onFill} />
                      </View>
                    )}
                  </Tappable>
                );
              })}
            </View>
          </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: '82%',
    paddingBottom: space.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  title: {
    fontFamily: font.display,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    paddingHorizontal: space.lg,
  },
  scrollContent: {
    paddingBottom: space.xl,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: space.md,
    gap: space.md,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontFamily: font.uiStrong,
    fontSize: 17,
  },
  previewSub: {
    fontFamily: font.ui,
    fontSize: 13,
    marginTop: 2,
  },
  sectionHeading: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionButtonText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'space-between',
  },
  presetCard: {
    width: '48%',
    padding: space.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    position: 'relative',
  },
  presetIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  presetLabel: {
    fontSize: 12,
    flex: 1,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
