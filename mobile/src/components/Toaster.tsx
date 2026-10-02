import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Notice, subscribeToNotices } from '../dialog';
import { font, radius, space, useTheme } from '../theme';

/** Long enough to read two lines without becoming something you wait out. */
const DWELL_MS = 4500;

/**
 * In-app notices, in place of a browser dialog.
 *
 * On web `notify` was `window.alert`, which puts the Cloud Run hostname above
 * every message — "gemini-proxy-297164004726.asia-southeast1.run.app says" —
 * and makes a saved workout read like a system error. It also blocks the whole
 * page, which is how a stray alert can freeze an automated session.
 *
 * Mounted once at the root. Anything that wants to say something calls
 * `notify`, exactly as before; this is the only thing that knows it is drawn
 * rather than dialled.
 */
export const Toaster = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => subscribeToNotices(setNotice), []);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), DWELL_MS);
    // Keyed on the notice, so a second one arriving restarts the clock rather
    // than inheriting the remainder of the first one's.
    return () => clearTimeout(timer);
  }, [notice]);

  if (notice === null) return null;

  return (
    <Pressable
      onPress={() => setNotice(null)}
      style={[styles.wrap, { bottom: insets.bottom + space.xl }]}
      accessibilityLabel={`${notice.title}. Tap to dismiss.`}
    >
      <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>{notice.title}</Text>
        {notice.message !== undefined && (
          <Text style={[styles.message, { color: colors.textMuted }]}>{notice.message}</Text>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  // Above the tab bar and clear of the home indicator, so it never covers the
  // control someone is about to press next.
  wrap: { position: 'absolute', left: space.lg, right: space.lg },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: 2,
  },
  title: { fontFamily: font.uiStrong, fontSize: 14 },
  message: { fontFamily: font.ui, fontSize: 13, lineHeight: 18 },
});
