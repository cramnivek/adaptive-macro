import type { Meal } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEAL_LABELS } from '../format';
import { font, radius, space, useTheme } from '../theme';
import { Button, TOUCH_TARGET } from './Controls';

interface MealActionsSheetProps {
  meal: Meal | null;
  onClose: () => void;
  onDescribe: (meal: Meal) => void;
  onPhotograph: (meal: Meal) => void;
  onScan: (meal: Meal) => void;
}

/**
 * The two less-used ways to add food to a meal.
 *
 * These were icon buttons on every meal card — a sparkle and a barcode, four
 * times over, which is twelve targets on one screen and two glyphs nobody
 * reads the same way twice. Behind one overflow they can afford words.
 */
export const MealActionsSheet = ({
  meal,
  onClose,
  onDescribe,
  onPhotograph,
  onScan,
}: MealActionsSheetProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={meal !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        {meal && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Add to {MEAL_LABELS[meal]}</Text>

            <Pressable onPress={() => onDescribe(meal)} style={[styles.row, { borderColor: colors.border }]}>
              <Ionicons name="sparkles-outline" size={20} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Describe it in words</Text>
                <Text style={[styles.rowHint, { color: colors.textFaint }]}>
                  Write or dictate what you ate and get macros back.
                </Text>
              </View>
            </Pressable>

            <Pressable onPress={() => onPhotograph(meal)} style={[styles.row, { borderColor: colors.border }]}>
              <Ionicons name="camera-outline" size={20} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Photograph it</Text>
                <Text style={[styles.rowHint, { color: colors.textFaint }]}>
                  Estimate the macros from a picture of the plate.
                </Text>
              </View>
            </Pressable>

            <Pressable onPress={() => onScan(meal)} style={[styles.row, { borderColor: colors.border }]}>
              <Ionicons name="barcode-outline" size={20} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Scan a barcode</Text>
                <Text style={[styles.rowHint, { color: colors.textFaint }]}>
                  Point the camera at the packaging.
                </Text>
              </View>
            </Pressable>

            <View style={{ height: space.md }} />
            <Button label="Cancel" variant="subtle" onPress={onClose} />
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  title: { fontFamily: font.uiStrong, fontSize: 16, marginBottom: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_TARGET + 12,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontFamily: font.ui, fontSize: 15 },
  rowHint: { fontFamily: font.ui, fontSize: 12, marginTop: 2 },
});
