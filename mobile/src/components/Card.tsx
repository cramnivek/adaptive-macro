import Ionicons from '@expo/vector-icons/Ionicons';
import React, { type ComponentProps } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { font, radius, space, useTheme, type FeatureTone } from '../theme';
import { session as loud } from '../theme/sessionTheme';

interface CardProps {
  /** Draws on the training side's palette rather than the app's quiet one. */
  loud?: boolean;
  /**
   * 'section' (default): Rule-led divider layout, avoiding box clutter on data screens.
   * 'featured': A raised, rounded card container with surface fill and border.
   */
  variant?: 'section' | 'featured';
  tone?: FeatureTone;
  icon?: ComponentProps<typeof Ionicons>['name'];
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
  tone,
  icon,
}: CardProps) => {
  const { colors } = useTheme();
  const isFeatured = variant === 'featured';
  const feature = tone ? colors.features[tone] : undefined;
  const headingColor = isLoud ? loud.figure : feature?.accent ?? colors.text;

  return (
    <View
      style={[
        styles.section,
        isFeatured && [
          styles.featured,
          {
            backgroundColor: isLoud ? loud.panel : feature?.surface ?? colors.surface,
            borderColor: isLoud ? loud.rule : colors.border,
          },
        ],
        style,
      ]}
    >
      {(title || right) && (
        <View style={[styles.header, !subtitle && styles.headerGap]}>
          {icon && <Ionicons name={icon} size={18} color={headingColor} accessible={false} />}
          {title && (
            <Text style={[styles.title, isFeatured && styles.featuredTitle, { color: headingColor }]}>{title}</Text>
          )}
          <View style={[styles.rule, { backgroundColor: isFeatured ? 'transparent' : isLoud ? loud.rule : colors.border }]} />
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
  featuredTitle: { fontFamily: font.uiStrong, fontSize: 14, letterSpacing: 0, textTransform: 'none', flexShrink: 1 },
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
