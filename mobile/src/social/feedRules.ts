import type { FeedPost, FollowState } from './types';

/**
 * Small decisions the social screens make, kept apart from the network so they can be tested.
 */

/** Where the next page of a feed starts: the last post's time and id. */
export type FeedCursor = { at: string; id: string };

/**
 * A username search as a safe LIKE prefix, or null when it isn't worth sending.
 * Usernames are `a–z 0–9 _ .`, so anything else can only match nothing, and `_`
 * and `%` are LIKE wildcards that must be escaped to mean themselves.
 */
export const escapeSearch = (text: string): string | null => {
  const query = text.trim().replace(/^@/, '').toLowerCase();
  if (query.length < 2 || !/^[a-z0-9_.%]+$/.test(query)) return null;
  return query.replace(/[\\%_]/g, (c) => `\\${c}`);
};

/** A feed_posts row as the app's type. Counts and numerics can arrive as strings. */
export const toFeedPost = (row: Record<string, unknown>): FeedPost =>
  ({
    ...row,
    volume_kg: row.volume_kg === null || row.volume_kg === undefined ? null : Number(row.volume_kg),
    like_count: Number(row.like_count ?? 0),
    liked: row.liked === true,
  }) as FeedPost;

export const followStateFor = (me: string, them: string, follow: { status: string } | null): FollowState => {
  if (me === them) return 'self';
  if (follow === null) return 'none';
  return follow.status === 'accepted' ? 'following' : 'requested';
};

/** The cursor that asks for the page after this one. */
export const cursorAfter = (posts: FeedPost[]): FeedCursor | null =>
  posts.length === 0 ? null : { at: posts[posts.length - 1].created_at, id: posts[posts.length - 1].id };
