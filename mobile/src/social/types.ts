import type { PostRow } from './postPayload';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  instagram: string | null;
  is_private: boolean;
}

export interface Post extends PostRow {
  id: string;
  author_id: string;
  created_at: string;
}

/** A post as the feed returns it: with its author and its likes. */
export interface FeedPost extends Post {
  username: string;
  display_name: string;
  like_count: number;
  liked: boolean;
}

/** Someone else's profile, as far as anyone signed in may see it. */
export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  instagram: string | null;
  is_private: boolean;
}

/** What the follow button on a profile says. */
export type FollowState = 'self' | 'none' | 'requested' | 'following';
