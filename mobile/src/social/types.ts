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
