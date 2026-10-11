import { StyleSheet, Text, View } from 'react-native';
import type { PostView } from '../social/postPayload';
import { font, radius, space, useTheme } from '../theme';
import { Button } from './Controls';

/** One workout post: the figures, the day's best, the first lifts, and what was said about it. */
export const PostCard = ({ view, onDelete }: { view: PostView; onDelete?: () => void }) => {
  const { colors } = useTheme();
  const facts = [view.date, view.duration, `${view.sets} ${view.sets === 1 ? 'set' : 'sets'}`, view.volume]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>{view.title}</Text>
      <Text style={[styles.facts, { color: colors.textMuted }]}>{facts}</Text>
      {view.caption && <Text style={[styles.caption, { color: colors.text }]}>{view.caption}</Text>}
      {view.highlight && (
        <Text style={[styles.highlight, { color: colors.accent }]}>
          NEW BEST · {view.highlight.label} · {view.highlight.figure}
        </Text>
      )}
      {view.exercises.map((lift) => (
        <Text key={lift.name} style={[styles.lift, { color: colors.text }]}>
          {lift.sets} {lift.sets === 1 ? 'set' : 'sets'} {lift.name} — {lift.best}
        </Text>
      ))}
      {view.more > 0 && (
        <Text style={[styles.more, { color: colors.textFaint }]}>
          + {view.more} more {view.more === 1 ? 'exercise' : 'exercises'}
        </Text>
      )}
      {onDelete && <Button label="Delete post" variant="subtle" onPress={onDelete} />}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  title: { fontFamily: font.display, fontSize: 20 },
  facts: { fontFamily: font.figure, fontSize: 13, marginTop: 4, marginBottom: space.sm },
  caption: { fontFamily: font.ui, fontSize: 15, marginBottom: space.sm },
  highlight: { fontFamily: font.uiStrong, fontSize: 13, marginBottom: space.sm },
  lift: { fontFamily: font.ui, fontSize: 14, marginBottom: 2 },
  more: { fontFamily: font.ui, fontSize: 13, marginTop: 2, marginBottom: space.sm },
});
