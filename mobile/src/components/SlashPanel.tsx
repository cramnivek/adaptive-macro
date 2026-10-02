import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SKEW } from '../theme';

interface SlashPanelProps {
  color: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Overrides the shared lean. Pass the mirrored angle to make a pair meet. */
  skew?: string;
}

/**
 * A leaning slab with upright content on top of it.
 *
 * The skew is on a filled layer behind the children, never on the children
 * themselves. Skewing the text as well would be closer to the reference and
 * would also make a column of weights unreadable, which is the one thing a
 * screen you read mid-set cannot afford.
 *
 * The slab overhangs its own box by a few pixels at the corners, which is the
 * point — nothing here clips it, so the diagonal reads as a cut through the
 * layout rather than a rotated rectangle sitting inside it.
 *
 * The children are wrapped and lifted rather than left as bare siblings, and
 * that wrapper is load-bearing on web. React Native paints siblings in
 * document order, so the fill being first was enough. The DOM does not: a
 * positioned element paints above every non-positioned one regardless of
 * order. React Native Web gives View and Text `position: relative`, so they
 * cleared the fill by luck, but `react-native-svg` renders a bare `<svg>` that
 * stays static — so every icon inside a panel was painted *underneath* the
 * colour and vanished, on web only, which is the build the iOS PWA runs.
 */
export const SlashPanel = ({ color, children, style, skew = SKEW }: SlashPanelProps) => (
  <View style={style}>
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: color, transform: [{ skewX: skew }] }]}
    />
    {/* Unstyled apart from the lift, so every call site's layout is unchanged. */}
    <View style={styles.content}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  content: { zIndex: 1 },
});
