import { client, fail, userId } from './api';
import { cursorAfter, escapeSearch, followStateFor, toFeedPost, type FeedCursor } from './feedRules';
import type { FeedPost, FollowState, PublicProfile } from './types';

/**
 * Following, the feed, likes, reports and blocks.
 *
 * Every rule about who may see what is in the database. These calls just ask,
 * and each failure comes back as a sentence the screen can show as it is.
 *
 * Block secrecy: a follow, like or block of an account that is blocked or missing succeeds
 * with zero rows. Those inserts never chain `.select()` or `.single()`, which would raise
 * PGRST116 and tell the caller they had been blocked. Screens re-read the state afterwards.
 */

const PROFILE_COLUMNS = 'id, username, display_name, instagram, is_private';
const PAGE = 20;

export type ReportReason = 'spam' | 'abuse' | 'nudity' | 'other';

export { cursorAfter };
export type { FeedCursor };

export const searchProfiles = async (text: string): Promise<PublicProfile[]> => {
  const prefix = escapeSearch(text);
  if (prefix === null) return [];
  const { data, error } = await client()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .like('username', `${prefix}%`)
    .order('username')
    .limit(20);
  if (error) fail(error);
  return (data ?? []) as PublicProfile[];
};

export const profileByUsername = async (username: string): Promise<PublicProfile | null> => {
  const { data, error } = await client()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('username', username.toLowerCase())
    .maybeSingle();
  if (error) fail(error);
  return data as PublicProfile | null;
};

/** Zeros for a profile that is missing or hidden: the database returns no row for those. */
export const followCounts = async (id: string): Promise<{ followers: number; following: number }> => {
  const { data, error } = await client().rpc('follow_counts', { profile: id });
  if (error) fail(error);
  const row = (data as { followers: number | string; following: number | string }[] | null)?.[0];
  return { followers: Number(row?.followers ?? 0), following: Number(row?.following ?? 0) };
};

export const followState = async (them: string): Promise<FollowState> => {
  const me = await userId();
  if (me === them) return 'self';
  const { data, error } = await client()
    .from('follows')
    .select('status')
    .eq('follower_id', me)
    .eq('followee_id', them)
    .maybeSingle();
  if (error) fail(error);
  return followStateFor(me, them, data as { status: string } | null);
};

export const follow = async (them: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('follows').insert({ follower_id: me, followee_id: them });
  // Following twice is still following.
  if (error && !(error.code === '23505' && error.message?.includes('follows_pkey'))) fail(error);
};

export const unfollow = async (them: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('follows').delete().eq('follower_id', me).eq('followee_id', them);
  if (error) fail(error);
};

export const pendingRequests = async (): Promise<PublicProfile[]> => {
  const me = await userId();
  const { data, error } = await client()
    .from('follows')
    .select(`created_at, follower:profiles!follows_follower_id_fkey(${PROFILE_COLUMNS})`)
    .eq('followee_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as unknown as { follower: PublicProfile | null }[])
    .map((row) => row.follower)
    .filter((p): p is PublicProfile => p !== null);
};

export const acceptRequest = async (from: string): Promise<void> => {
  const me = await userId();
  const { error } = await client()
    .from('follows')
    .update({ status: 'accepted' })
    .eq('follower_id', from)
    .eq('followee_id', me);
  if (error) fail(error);
};

export const declineRequest = async (from: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('follows').delete().eq('follower_id', from).eq('followee_id', me);
  if (error) fail(error);
};

export const feedPage = async (before: FeedCursor | null): Promise<FeedPost[]> => {
  const { data, error } = await client().rpc('feed_page', { before: before?.at ?? null, before_id: before?.id ?? null, size: PAGE });
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(toFeedPost);
};

export const postsBy = async (author: string, before: FeedCursor | null): Promise<FeedPost[]> => {
  let query = client()
    .from('feed_posts')
    .select('*')
    .eq('author_id', author)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE);
  // (created_at, id) < (at, id), spelled for PostgREST: earlier, or the same moment with a smaller id.
  if (before !== null) query = query.or(`created_at.lt.${before.at},and(created_at.eq.${before.at},id.lt.${before.id})`);
  const { data, error } = await query;
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(toFeedPost);
};

export const like = async (postId: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('likes').insert({ post_id: postId, user_id: me });
  // A second tap that raced the first is still a like.
  if (error && !(error.code === '23505' && error.message?.includes('likes_pkey'))) fail(error);
};

export const unlike = async (postId: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('likes').delete().eq('post_id', postId).eq('user_id', me);
  if (error) fail(error);
};

export const block = async (them: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('blocks').insert({ blocker_id: me, blocked_id: them });
  if (error && !(error.code === '23505' && error.message?.includes('blocks_pkey'))) fail(error);
};

export const unblock = async (them: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('blocks').delete().eq('blocker_id', me).eq('blocked_id', them);
  if (error) fail(error);
};

export const blockedProfiles = async (): Promise<PublicProfile[]> => {
  // Profiles across a block are hidden from both people, so the blocked person's
  // name comes from a function that answers for the caller's own blocks only.
  // `my_blocked_profiles` arrives in Task 4; until then this fails.
  const { data, error } = await client().rpc('my_blocked_profiles');
  if (error) fail(error);
  return (data ?? []) as PublicProfile[];
};

export const report = async (input: {
  postId?: string;
  profileId?: string;
  reason: ReportReason;
  note: string;
}): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('reports').insert({
    reporter_id: me,
    post_id: input.postId ?? null,
    profile_id: input.profileId ?? null,
    reason: input.reason,
    note: input.note.trim() || null,
  });
  if (error) fail(error);
};
