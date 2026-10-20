import React, { useContext } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, space, useTheme } from '../theme';
import { FloatingBarInset } from './FloatingWorkoutBar';
import { session as loud } from '../theme/sessionTheme';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /**
   * Switches the page onto the training side's palette: a darker ground and
   * its own figure colours. One prop rather than a colour per slot, because
   * passing only the background would leave a light scheme's near-black title
   * invisible on a near-black page.
   */
  tone?: 'loud';
  /** Drawn at the right of the title, e.g. a settings gear. */
  action?: React.ReactNode;
}

/**
 * Standard scrolling screen frame.
 *
 * Bottom padding adds the safe-area inset to the tab bar height so the last
 * card clears the home indicator on a notched phone and is not left under the
 * tab bar on a flat one — measured, not a fixed guess.
 */
export const Screen = ({ title, subtitle, children, onRefresh, refreshing, tone, action }: ScreenProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Room for the floating workout bar, when this is a tab and the bar is up.
  const barInset = useContext(FloatingBarInset);

  return (
    <ScrollView
      style={{ backgroundColor: tone === 'loud' ? loud.ground : colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl + barInset },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={colors.textMuted} />
        ) : undefined
      }
    >
      {/* An action alone still draws the header: a modal whose stack header already
          shows its title would otherwise have to pass one here only to get the
          slot, and the heading would appear twice. */}
      {(title || action) && (
        <View style={styles.header}>
          <View style={styles.titleRow}>
            {title ? (
              <Text style={[styles.title, { color: tone === 'loud' ? loud.figure : colors.text }]}>{title}</Text>
            ) : (
              <View />
            )}
            {action}
          </View>
          {subtitle && (
            <Text
              style={[styles.subtitle, { color: tone === 'loud' ? loud.figureMuted : colors.textMuted }]}
            >
              {subtitle}
            </Text>
          )}
        </View>
      )}
      {children}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg },
  header: { marginBottom: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Display weight: the quiet screens keep their palette but not their timid
  // headings — this is the typographic half of the logger's identity, which
  // carries everywhere without bringing the red with it.
  title: { fontFamily: font.display, fontSize: 28, letterSpacing: -0.6 },
  subtitle: { fontFamily: font.ui, fontSize: 14, marginTop: 2 },
});
