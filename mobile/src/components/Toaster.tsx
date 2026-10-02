import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Notice, subscribeToNotices } from '../dialog';
import { font, radius, space, useTheme } from '../theme';
import { duration, ease, exit } from '../theme/motion';

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
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => subscribeToNotices(setNotice), []);

  /**
   * Takes the notice it is dismissing so a replacement arriving mid-exit is not
   * cleared by the outgoing animation's callback — `at` is what distinguishes
   * two otherwise identical notices.
   */
  const hide = useCallback(
    (target: Notice) => {
      Animated.timing(progress, {
        toValue: 0,
        duration: duration.press,
        easing: exit,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setNotice((current) => (current?.at === target.at ? null : current));
      });
    },
    [progress],
  );

  useEffect(() => {
    if (notice === null) return;
    // Back to the start on every notice, so a second one slides in rather than
    // silently swapping its text behind an already-settled card.
    progress.setValue(0);
    const entering = Animated.timing(progress, {
      toValue: 1,
      duration: duration.enter,
      easing: ease,
      useNativeDriver: true,
    });
    entering.start();
    const timer = setTimeout(() => hide(notice), DWELL_MS);
    return () => {
      entering.stop();
      clearTimeout(timer);
    };
  }, [notice, progress, hide]);

  if (notice === null) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: insets.bottom + space.xl,
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          ],
        },
      ]}
    >
      <Pressable
        onPress={() => hide(notice)}
        accessibilityLabel={`${notice.title}. Tap to dismiss.`}
      >
        <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{notice.title}</Text>
          {notice.message !== undefined && (
            <Text style={[styles.message, { color: colors.textMuted }]}>{notice.message}</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
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
