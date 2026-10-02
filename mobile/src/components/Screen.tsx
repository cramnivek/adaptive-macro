import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, space, useTheme } from '../theme';
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
}

/**
 * Standard scrolling screen frame.
 *
 * Bottom padding adds the safe-area inset to the tab bar height so the last
 * card clears the home indicator on a notched phone and is not left under the
 * tab bar on a flat one — measured, not a fixed guess.
 */
export const Screen = ({ title, subtitle, children, onRefresh, refreshing, tone }: ScreenProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: tone === 'loud' ? loud.ground : colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={colors.textMuted} />
        ) : undefined
      }
    >
      {title && (
        <View style={styles.header}>
          <Text style={[styles.title, { color: tone === 'loud' ? loud.figure : colors.text }]}>{title}</Text>
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
  // Display weight: the quiet screens keep their palette but not their timid
  // headings — this is the typographic half of the logger's identity, which
  // carries everywhere without bringing the red with it.
  title: { fontFamily: font.display, fontSize: 28, letterSpacing: -0.6 },
  subtitle: { fontFamily: font.ui, fontSize: 14, marginTop: 2 },
});
