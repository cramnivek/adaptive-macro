import { useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { thud } from '../platform/haptics';
import { font, radius, space, useTheme } from '../theme';
import { useApp } from '../state/AppStore';
import type { FeatureInterest } from '../state/settings';
import { FeatureInterestPicker } from './FeatureInterestPicker';

export interface FeatureInterestModalProps {
  visible: boolean;
  onClose: () => void;
}

export const FeatureInterestModal = ({
  visible,
  onClose,
}: FeatureInterestModalProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useApp();

  const [selected, setSelected] = useState<FeatureInterest[]>(
    settings.featureInterests ?? []
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelected(settings.featureInterests ?? []);
    }
  }, [visible, settings.featureInterests]);

  const handleSave = async (interests: FeatureInterest[]) => {
    setSaving(true);
    try {
      await updateSettings({
        featureInterests: interests,
        featureOnboardingDismissed: true,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    thud('light');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: Math.max(insets.top, space.md),
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTitleCol}>
            <View style={styles.badgeRow}>
              <Ionicons name="sparkles" size={12} color={colors.accent} />
              <Text style={[styles.badgeText, { color: colors.accent }]}>
                PERSONALIZE ASCEND
              </Text>
            </View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Customize Your Focus
            </Text>
          </View>

          <Pressable
            onPress={handleClose}
            hitSlop={12}
            style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]}
            accessibilityRole="button"
            accessibilityLabel="Close feature focus modal"
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* Scrollable Content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.introText, { color: colors.textMuted }]}>
            Pick the features you want front and center. Ascend will personalize your Today dashboard, recommendations, and quick actions to match your goals.
          </Text>

          <FeatureInterestPicker
            selectedInterests={selected}
            onChange={setSelected}
            onSave={handleSave}
            isSaving={saving}
            saveButtonLabel="SAVE & APPLY FOCUS"
          />
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleCol: {
    flex: 1,
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  badgeText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontFamily: font.uiStrong,
    fontSize: 18,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: space.lg,
    gap: space.md,
    paddingBottom: space.xxl,
  },
  introText: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
  },
});
