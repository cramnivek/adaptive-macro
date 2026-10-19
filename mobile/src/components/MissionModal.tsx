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
import type { DashboardSpotlight, UserMission } from '../state/settings';
import { MissionPicker } from './MissionPicker';

export interface MissionModalProps {
  visible: boolean;
  onClose: () => void;
}

export const MissionModal = ({
  visible,
  onClose,
}: MissionModalProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useApp();

  const [mission, setMission] = useState<UserMission>(settings.userMission ?? 'hybrid');
  const [spotlight, setSpotlight] = useState<DashboardSpotlight>(
    settings.dashboardSpotlight ?? 'balanced'
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setMission(settings.userMission ?? 'hybrid');
      setSpotlight(settings.dashboardSpotlight ?? 'balanced');
    }
  }, [visible, settings.userMission, settings.dashboardSpotlight]);

  const handleSave = async (newMission: UserMission, newSpotlight: DashboardSpotlight) => {
    setSaving(true);
    try {
      await updateSettings({
        userMission: newMission,
        dashboardSpotlight: newSpotlight,
        missionOnboardingDismissed: true,
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>Your focus</Text>
          </View>

          <Pressable
            onPress={handleClose}
            hitSlop={12}
            style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]}
            accessibilityRole="button"
            accessibilityLabel="Close"
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
            What you are training for, and what Today shows first.
          </Text>

          <MissionPicker
            selectedMission={mission}
            selectedSpotlight={spotlight}
            onChangeMission={setMission}
            onChangeSpotlight={setSpotlight}
            onSave={handleSave}
            isSaving={saving}
            saveButtonLabel="Save"
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
  headerTitle: {
    fontFamily: font.uiStrong,
    fontSize: 18,
  },
  // 44 rather than 32: hitSlop is ignored on web, so the circle is the target.
  closeButton: {
    width: 44,
    height: 44,
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
