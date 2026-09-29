import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { font, space, useTheme } from '../theme';

interface CardProps {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * A titled section of a screen.
 *
 * This was a filled, bordered card. On screens that are mostly numbers a stack
 * of boxes competes with the figures for attention, and the border is the
 * first thing a reader stops seeing. It is now a rule-led section: a small
 * uppercase heading, a hairline running out to whatever sits on the right, and
 * the content below it.
 *
 * The props did not change, so every call site survived the switch untouched.
 */
export const Card = ({ title, subtitle, right, children, style }: CardProps) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, style]}>
      {(title || right) && (
        <View style={styles.header}>
          {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
          <View style={[styles.rule, { backgroundColor: colors.border }]} />
          {right}
        </View>
      )}
      {/* Below the heading rather than beside it: several callers pass a whole
          sentence here, which would be truncated on a phone by an inline slot. */}
      {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  subtitle: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: space.xs },
});
