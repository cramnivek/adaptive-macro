import { StyleSheet, Text, View } from 'react-native';
import { font, radius, space, useTheme, type FeatureTone } from '../theme';

/** Gives the next useful step a consistent home without making it an alert. */
export const AdviceNote = ({ label, children, tone }: { label: string; children: string; tone?: FeatureTone }) => {
  const { colors } = useTheme();
  const feature = tone ? colors.features[tone] : undefined;
  return <View style={[styles.note, { backgroundColor: feature?.note ?? colors.surfaceRaised }]}>
    <Text style={[styles.label, { color: feature?.accent ?? colors.textMuted }]}>{label}</Text>
    <Text style={[styles.body, { color: colors.text }]}>{children}</Text>
  </View>;
};

const styles = StyleSheet.create({
  note: { padding: space.md, borderRadius: radius.md, gap: space.xs, marginVertical: space.sm },
  label: { fontFamily: font.uiStrong, fontSize: 12, lineHeight: 17 },
  body: { fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
});
