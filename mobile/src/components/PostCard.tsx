import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import type { PostView } from '../social/postPayload';
import { font, radius, space, useTheme } from '../theme';
import { Button, TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

/** One workout post: the figures, the day's best, the first lifts, and what was said about it. */
export const PostCard = ({
  view,
  onDelete,
  author,
  likes,
  onMore,
}: {
  view: PostView;
  onDelete?: () => void;
  /** Whose post, for the feed and other people's profiles; tapping opens their profile. */
  author?: { username: string; displayName: string; onPress: () => void };
  likes?: { count: number; liked: boolean; onToggle: () => void };
  /** The ⋯ menu: report, block. */
  onMore?: () => void;
}) => {
  const { colors } = useTheme();
  const facts = [view.date, view.duration, `${view.sets} ${view.sets === 1 ? 'set' : 'sets'}`, view.volume]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {(author || onMore) && (
        <View style={styles.byline}>
          {author ? (
            <Tappable onPress={author.onPress} accessibilityRole="button" hitSlop={8} style={styles.target}>
              <Text style={[styles.name, { color: colors.text }]}>{author.displayName}</Text>
              <Text style={[styles.handle, { color: colors.textFaint }]}>@{author.username}</Text>
            </Tappable>
          ) : (
            <View />
          )}
          {onMore && (
            <Tappable onPress={onMore} accessibilityRole="button" accessibilityLabel="More" hitSlop={8} style={[styles.target, styles.centered]}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
            </Tappable>
          )}
        </View>
      )}
      <Text style={[styles.title, { color: colors.text }]}>{view.title}</Text>
      <Text style={[styles.facts, { color: colors.textMuted }]}>{facts}</Text>
      {view.caption && <Text style={[styles.caption, { color: colors.text }]}>{view.caption}</Text>}
      {view.highlight && (
        <Text style={[styles.highlight, { color: colors.accent }]}>
          NEW BEST · {view.highlight.label} · {view.highlight.figure}
        </Text>
      )}
      {view.exercises.map((lift, index) => (
        <Text key={`${lift.name}-${index}`} style={[styles.lift, { color: colors.text }]}>
          {lift.sets} {lift.sets === 1 ? 'set' : 'sets'} {lift.name} — {lift.best}
        </Text>
      ))}
      {view.more > 0 && (
        <Text style={[styles.more, { color: colors.textFaint }]}>
          + {view.more} more {view.more === 1 ? 'exercise' : 'exercises'}
        </Text>
      )}
      {likes && (
        <View style={styles.likes}>
          <Tappable
            onPress={likes.onToggle}
            accessibilityRole="button"
            accessibilityLabel={likes.liked ? 'Unlike' : 'Like'}
            accessibilityState={{ selected: likes.liked }}
            hitSlop={8}
            style={[styles.target, styles.like]}
          >
            <Ionicons
              name={likes.liked ? 'heart' : 'heart-outline'}
              size={22}
              color={likes.liked ? colors.danger : colors.textMuted}
            />
            <Text style={[styles.count, { color: colors.textMuted }]}>{likes.count}</Text>
          </Tappable>
        </View>
      )}
      {onDelete && <Button label="Delete post" variant="subtle" onPress={onDelete} />}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  byline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  // Real height rather than only hitSlop, which react-native-web ignores.
  target: { minHeight: TOUCH_TARGET, padding: 8, justifyContent: 'center' },
  centered: { minWidth: TOUCH_TARGET, alignItems: 'center' },
  name: { fontFamily: font.uiStrong, fontSize: 15 },
  handle: { fontFamily: font.ui, fontSize: 13 },
  likes: { flexDirection: 'row', marginBottom: space.sm },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontFamily: font.figure, fontSize: 14 },
  title: { fontFamily: font.display, fontSize: 20 },
  facts: { fontFamily: font.figure, fontSize: 13, marginTop: 4, marginBottom: space.sm },
  caption: { fontFamily: font.ui, fontSize: 15, marginBottom: space.sm },
  highlight: { fontFamily: font.uiStrong, fontSize: 13, marginBottom: space.sm },
  lift: { fontFamily: font.ui, fontSize: 14, marginBottom: 2 },
  more: { fontFamily: font.ui, fontSize: 13, marginTop: 2, marginBottom: space.sm },
});
