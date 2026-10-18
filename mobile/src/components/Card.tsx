import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { font, radius, space, useTheme } from '../theme';
import { session as loud } from '../theme/sessionTheme';

interface CardProps {
  /** Draws on the training side's palette rather than the app's quiet one. */
  loud?: boolean;
  /**
   * 'section' (default): Rule-led divider layout, avoiding box clutter on data screens.
   * 'featured': A raised, rounded card container with surface fill and border.
   */
  variant?: 'section' | 'featured';
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * A titled section of a screen.
 *
 * Distinguishes ordinary rule-led content groupings ('section') from
 * filled, rounded spotlight surfaces ('featured').
 */
export const Card = ({
  title,
  subtitle,
  right,
  children,
  style,
  loud: isLoud = false,
  variant = 'section',
}: CardProps) => {
  const { colors } = useTheme();
  const isFeatured = variant === 'featured';

  return (
    <View
      style={[
        styles.section,
        isFeatured && [
          styles.featured,
          {
            backgroundColor: isLoud ? loud.panel : colors.surfaceRaised,
            borderColor: isLoud ? loud.rule : colors.border,
          },
        ],
        style,
      ]}
    >
      {(title || right) && (
        <View style={[styles.header, !subtitle && styles.headerGap]}>
          {title && (
            <Text style={[styles.title, { color: isLoud ? loud.figure : colors.text }]}>{title}</Text>
          )}
          <View style={[styles.rule, { backgroundColor: isLoud ? loud.rule : colors.border }]} />
          {right}
        </View>
      )}
      {subtitle && (
        <Text style={[styles.subtitle, { color: isLoud ? loud.figureMuted : colors.textMuted }]}>
          {subtitle}
        </Text>
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: space.xl },
  featured: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // With a subtitle the gap belongs below the subtitle, not between it and the rule.
  headerGap: { marginBottom: space.md },
  title: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  subtitle: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: space.xs, marginBottom: space.md },
});
