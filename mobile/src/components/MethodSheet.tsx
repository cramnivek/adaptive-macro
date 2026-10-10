import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useTheme } from '../theme';
import { Button } from './Controls';

interface MethodSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * How the expenditure number is arrived at.
 *
 * This used to be the bottom third of the Trends screen: a hundred and fifty
 * words and an equation, under a heading, every time anyone opened it. It is
 * good writing about the one thing that makes this app different from a
 * calorie counter — and it is reference material, read once and then never
 * again, which is exactly the kind of thing that should be a tap away rather
 * than permanently in front of someone checking a number.
 *
 * Same treatment the exercise how-to gets, and for the same reason.
 */
export const MethodSheet = ({ open, onClose }: MethodSheetProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
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
        <ScrollView>
          <Text style={[styles.title, { color: colors.text }]}>Where this number comes from</Text>

          <Text style={[styles.body, { color: colors.textMuted }]}>
            There is only one equation linking expenditure to anything you can measure:
          </Text>
          <Text style={[styles.equation, { color: colors.text }]}>
            weight change = (intake − expenditure) ÷ 7700 kcal per kg
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Expenditure is the unknown. A Kalman filter tracks it alongside your true trend weight,
            moving it to whatever value keeps explaining what your scale actually did. Day-to-day
            water and gut-content swings are treated as measurement noise, so only changes that
            persist move the trend.
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            It adapts on its own — metabolic adaptation, activity drifting down in a deficit, a new
            training block all show up without being modelled by name.
          </Text>
          <Text style={[styles.body, { color: colors.warning }]}>
            The catch: it believes your food log. Consistent under-reporting looks exactly like a
            lower expenditure, and the estimate will follow it down.
          </Text>

          <View style={{ height: space.md }} />
          <Button label="Close" variant="subtle" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  title: { fontFamily: font.display, fontSize: 18, marginBottom: space.sm },
  body: { fontFamily: font.ui, fontSize: 14, lineHeight: 21, marginBottom: space.md },
  equation: {
    fontFamily: font.figure,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: space.md,
  },
});
