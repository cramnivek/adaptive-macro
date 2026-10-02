import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SKEW } from '../theme/sessionTheme';

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
 */
export const SlashPanel = ({ color, children, style, skew = SKEW }: SlashPanelProps) => (
  <View style={style}>
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: color, transform: [{ skewX: skew }] }]}
    />
    {children}
  </View>
);
