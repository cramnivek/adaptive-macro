import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, useTheme } from '../theme';
import { needsHomeScreenInstall } from '../web/persistence';

/**
 * Warns an iOS browser user that their diary is on a seven-day timer.
 *
 * Safari deletes script-writable storage after seven days without use, and
 * that is what the diary lives on. A home-screen install is exempt. This used
 * to be the first card of Settings, which meant the people who needed it most
 * — anyone who opened the site and started logging — never saw it.
 *
 * It is deliberately not dismissible. The consequence is losing the diary, and
 * a banner that can be tapped away is one that will be, a week before it
 * matters. It disappears on its own once the install is detected.
 */
export const HomeScreenNotice = () => {
  const { colors } = useTheme();
  if (!needsHomeScreenInstall()) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.surfaceRaised, borderColor: colors.danger }]}>
      <Ionicons name="warning-outline" size={18} color={colors.danger} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>Add this to your home screen</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Safari deletes a website's saved data after seven days without use, and that includes your
          diary. Adding this to your home screen exempts it — tap Share, then Add to Home Screen, then
          open it from there from now on.
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Until you do, save a backup from Settings if you have anything you would mind losing.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    marginBottom: space.md,
  },
  text: { flex: 1, gap: space.xs },
  title: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 12, lineHeight: 17 },
});
