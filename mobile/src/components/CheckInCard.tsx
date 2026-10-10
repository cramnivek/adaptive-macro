import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { checkInCopy } from '../checkInCopy';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Card } from './Card';
import { Button } from './Controls';
import { FadeIn } from './FadeIn';

/**
 * Last week, once: what changed in the target and why.
 *
 * Shown on today's screen from Monday until it is dismissed, then not again
 * until the next week ends — a weekly note, not a permanent fixture.
 */
export const CheckInCard = () => {
  const { colors } = useTheme();
  const { checkIn, settings, updateSettings } = useApp();

  if (checkIn === null || settings.checkInSeenWeek === checkIn.weekStart) return null;

  const copy = checkInCopy(checkIn, settings.goal, settings.units);

  return (
    <FadeIn>
      <Card title={`Last week · ${copy.week}`}>
        <Text style={[styles.headline, { color: colors.text }]}>{copy.headline}</Text>
        <Text style={[styles.reason, { color: colors.textMuted }]}>{copy.reason}</Text>

        <View style={styles.facts}>
          <View style={styles.fact}>
            <Ionicons name="restaurant-outline" size={15} color={colors.textMuted} />
            <Text style={[styles.factText, { color: colors.text }]}>{copy.logged}</Text>
          </View>
          <View style={styles.fact}>
            <Ionicons
              name={(checkIn.trendChangeKg ?? 0) > 0 ? 'trending-up-outline' : 'trending-down-outline'}
              size={15}
              color={colors.textMuted}
            />
            <Text style={[styles.factText, { color: colors.text }]}>{copy.weight}</Text>
          </View>
        </View>

        {copy.nudge && <Text style={[styles.nudge, { color: colors.warning }]}>{copy.nudge}</Text>}

        <Button
          label="Got it"
          variant="subtle"
          onPress={() => void updateSettings({ checkInSeenWeek: checkIn.weekStart })}
        />
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  headline: { fontFamily: font.display, fontSize: 20, lineHeight: 26 },
  reason: { fontFamily: font.ui, fontSize: 13, lineHeight: 18, marginTop: space.xs },
  facts: { gap: space.xs, marginVertical: space.md },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  factText: { fontFamily: font.ui, fontSize: 13, lineHeight: 18, flex: 1 },
  nudge: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginBottom: space.sm },
});
