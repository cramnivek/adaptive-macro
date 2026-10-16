import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { formatTimeAgo } from '../format';
import type { PostView } from '../social/postPayload';
import { font, radius, space, useTheme } from '../theme';
import { Button, TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

const AVATAR_PALETTE = ['#E57373', '#81C784', '#64B5F6', '#FFB74D', '#BA68C8', '#4DB6AC', '#F06292', '#FF8A65'];

const getAvatarColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const getInitials = (name?: string): string => {
  if (!name) return '🏋️';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

/**
 * Rich, engaging workout post card: user avatar, relative time, visual stat chips,
 * celebratory PR badges, clean exercise rows, cheer reactions, and share options.
 */
export const PostCard = ({
  view,
  onDelete,
  author,
  likes,
  onMore,
  createdAt,
}: {
  view: PostView;
  onDelete?: () => void;
  /** Whose post, for the feed and other people's profiles; tapping opens their profile. */
  author?: { username: string; displayName: string; onPress: () => void };
  likes?: { count: number; liked: boolean; onToggle: () => void };
  /** The ⋯ menu: report, block. */
  onMore?: () => void;
  /** ISO date string or timestamp for relative time formatting. */
  createdAt?: string;
}) => {
  const { colors } = useTheme();
  const [cheered, setCheered] = useState(false);

  const displayTime = createdAt
    ? formatTimeAgo(createdAt)
    : view.date
      ? formatTimeAgo(view.date)
      : '';

  const shareWorkout = async () => {
    try {
      const parts = [
        `🏋️ ${view.title}`,
        `${view.duration} · ${view.sets} sets${view.volume ? ` · ${view.volume}` : ''}`,
      ];
      if (view.highlight) {
        parts.push(`🏆 PR: ${view.highlight.label}: ${view.highlight.figure}`);
      }
      if (view.caption) {
        parts.push(`"${view.caption}"`);
      }
      parts.push('\nLogged on Adaptive Macro');
      await Share.share({ message: parts.join('\n') });
    } catch {
      // User cancelled share dialog
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header: Author Avatar & Byline */}
      {(author || onMore) && (
        <View style={styles.byline}>
          {author ? (
            <Tappable onPress={author.onPress} accessibilityRole="button" hitSlop={8} style={styles.authorTarget}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: getAvatarColor(author.username) },
                ]}
              >
                <Text style={styles.avatarText}>{getInitials(author.displayName || author.username)}</Text>
              </View>
              <View style={styles.authorMeta}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {author.displayName}
                </Text>
                <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
                  @{author.username}{displayTime ? ` · ${displayTime}` : ''}
                </Text>
              </View>
            </Tappable>
          ) : (
            <View />
          )}

          {onMore && (
            <Tappable
              onPress={onMore}
              accessibilityRole="button"
              accessibilityLabel="More options"
              hitSlop={8}
              style={[styles.target, styles.centered]}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
            </Tappable>
          )}
        </View>
      )}

      {/* Title & Caption */}
      <Text style={[styles.title, { color: colors.text }]}>{view.title}</Text>
      {view.caption ? <Text style={[styles.caption, { color: colors.text }]}>“{view.caption}”</Text> : null}

      {/* Visual Stat Badges */}
      <View style={styles.statsRow}>
        {view.duration ? (
          <View style={[styles.statChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="time-outline" size={13} color={colors.accent} />
            <Text style={[styles.statChipText, { color: colors.text }]}>{view.duration}</Text>
          </View>
        ) : null}

        {view.sets > 0 ? (
          <View style={[styles.statChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="flash-outline" size={13} color={colors.accent} />
            <Text style={[styles.statChipText, { color: colors.text }]}>
              {view.sets} {view.sets === 1 ? 'set' : 'sets'}
            </Text>
          </View>
        ) : null}

        {view.volume ? (
          <View style={[styles.statChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="barbell-outline" size={13} color={colors.accent} />
            <Text style={[styles.statChipText, { color: colors.text }]}>{view.volume}</Text>
          </View>
        ) : null}

        {view.steps && view.steps > 0 ? (
          <View style={[styles.statChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="footsteps-outline" size={13} color={colors.accent} />
            <Text style={[styles.statChipText, { color: colors.text }]}>~{view.steps.toLocaleString()} steps</Text>
          </View>
        ) : null}
      </View>

      {/* Celebratory PR Milestone Card */}
      {view.highlight && (
        <View style={[styles.highlightCard, { backgroundColor: colors.accent + '15', borderColor: colors.accent }]}>
          <Ionicons name="trophy" size={17} color={colors.accent} />
          <View style={styles.highlightContent}>
            <Text style={[styles.highlightTag, { color: colors.accent }]}>NEW PERSONAL BEST</Text>
            <Text style={[styles.highlightDetail, { color: colors.text }]}>
              {view.highlight.label}: {view.highlight.figure}
            </Text>
          </View>
        </View>
      )}

      {/* Formatted Exercise List */}
      <View style={styles.exerciseList}>
        {view.exercises.map((lift, index) => (
          <View
            key={`${lift.name}-${index}`}
            style={[
              styles.exerciseRow,
              index < view.exercises.length - 1 ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
            ]}
          >
            <View style={[styles.setsPill, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.setsPillText, { color: colors.textMuted }]}>
                {lift.sets > 0 ? `${lift.sets}s` : '—'}
              </Text>
            </View>
            <Text style={[styles.exerciseName, { color: colors.text }]} numberOfLines={1}>
              {lift.name}
            </Text>
            <Text style={[styles.exerciseBest, { color: colors.accent }]}>{lift.best}</Text>
          </View>
        ))}
      </View>

      {view.more > 0 && (
        <Text style={[styles.more, { color: colors.textFaint }]}>
          + {view.more} more {view.more === 1 ? 'exercise' : 'exercises'}
        </Text>
      )}

      {/* Social Actions Footer */}
      <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
        <View style={styles.interactions}>
          {likes && (
            <Tappable
              onPress={likes.onToggle}
              accessibilityRole="button"
              accessibilityLabel={likes.liked ? 'Unlike' : 'Like'}
              accessibilityState={{ selected: likes.liked }}
              hitSlop={8}
              style={[styles.actionBtn, likes.liked && styles.actionBtnActive]}
            >
              <Ionicons
                name={likes.liked ? 'heart' : 'heart-outline'}
                size={20}
                color={likes.liked ? colors.danger : colors.textMuted}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: likes.liked ? colors.danger : colors.textMuted },
                ]}
              >
                {likes.count}
              </Text>
            </Tappable>
          )}

          {/* Fist Bump / Cheer Quick Reaction */}
          <Tappable
            onPress={() => {
              setCheered((prev) => !prev);
              if (!likes?.liked && likes?.onToggle) {
                likes.onToggle();
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Fist bump cheer"
            hitSlop={8}
            style={[styles.actionBtn, cheered && styles.actionBtnActive]}
          >
            <Text style={styles.emojiIcon}>{cheered ? '🔥' : '👊'}</Text>
            <Text style={[styles.actionText, { color: cheered ? colors.accent : colors.textMuted }]}>
              {cheered ? 'Fired up!' : 'Cheer'}
            </Text>
          </Tappable>
        </View>

        <Tappable
          onPress={() => void shareWorkout()}
          accessibilityRole="button"
          accessibilityLabel="Share workout"
          hitSlop={8}
          style={styles.shareBtn}
        >
          <Ionicons name="share-outline" size={19} color={colors.textMuted} />
        </Tappable>
      </View>

      {onDelete && (
        <View style={styles.deleteSection}>
          <Button label="Delete post" variant="subtle" onPress={onDelete} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.lg,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  authorTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    color: '#ffffff',
  },
  authorMeta: {
    flex: 1,
  },
  name: {
    fontFamily: font.uiStrong,
    fontSize: 15,
  },
  handle: {
    fontFamily: font.ui,
    fontSize: 12,
    marginTop: 1,
  },
  target: {
    minHeight: TOUCH_TARGET,
    padding: 8,
    justifyContent: 'center',
  },
  centered: {
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
  },
  title: {
    fontFamily: font.display,
    fontSize: 20,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  caption: {
    fontFamily: font.ui,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: space.sm,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xs,
    marginBottom: space.md,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statChipText: {
    fontFamily: font.figure,
    fontSize: 12,
  },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm,
    marginBottom: space.md,
  },
  highlightContent: {
    flex: 1,
  },
  highlightTag: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  highlightDetail: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    marginTop: 1,
  },
  exerciseList: {
    marginBottom: space.xs,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 7,
  },
  setsPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  setsPillText: {
    fontFamily: font.figure,
    fontSize: 11,
  },
  exerciseName: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 14,
  },
  exerciseBest: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
  more: {
    fontFamily: font.ui,
    fontSize: 12,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
    marginTop: space.xs,
  },
  interactions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
  actionBtnActive: {
    transform: [{ scale: 1.05 }],
  },
  actionText: {
    fontFamily: font.figure,
    fontSize: 13,
  },
  emojiIcon: {
    fontSize: 15,
  },
  shareBtn: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteSection: {
    marginTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
  },
});
