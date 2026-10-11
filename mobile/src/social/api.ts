import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';
import { isAlreadyPosted, messageFor, type ServerError } from './errors';
import type { PostRow } from './postPayload';
import type { ProfileFields } from './profileRules';
import type { Post, Profile } from './types';

/**
 * Every call the screens make to Supabase.
 *
 * Each one throws an Error whose message is ready to show, so a screen catches
 * and displays it and never has to know what Postgres or the auth server said.
 */

const PROFILE_COLUMNS = 'id, username, display_name, instagram, is_private';
const POST_COLUMNS =
  'id, author_id, session_id, title, performed_on, duration_min, sets, volume_kg, exercises, highlight, caption, created_at';

const client = (): SupabaseClient => {
  if (supabase === null) throw new Error('Sign-in is not set up in this build.');
  return supabase;
};

function fail(error: ServerError): never {
  throw new Error(messageFor(error));
}

const userId = async (): Promise<string> => {
  const { data } = await client().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('You are signed out. Sign in and try again.');
  return id;
};

export const sendCode = async (email: string): Promise<void> => {
  const { error } = await client().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) fail(error);
};

export const verifyCode = async (email: string, code: string): Promise<void> => {
  const { error } = await client().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error) fail(error);
};

export const signOut = async (): Promise<void> => {
  const { error } = await client().auth.signOut();
  if (error) fail(error);
};

export const myProfile = async (): Promise<Profile | null> => {
  const id = await userId();
  const { data, error } = await client().from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
  if (error) fail(error);
  return data as Profile | null;
};

export const saveProfile = async (fields: ProfileFields & { is_private: boolean }): Promise<Profile> => {
  const id = await userId();
  const { data, error } = await client().from('profiles').upsert({ id, ...fields }).select(PROFILE_COLUMNS).single();
  if (error) fail(error);
  return data as Profile;
};

export const createPost = async (row: PostRow): Promise<void> => {
  const author_id = await userId();
  const { error } = await client().from('posts').insert({ ...row, author_id });
  // A retry whose first attempt did reach the server: that one is the post.
  if (error && !isAlreadyPosted(error)) fail(error);
};

export const myPosts = async (): Promise<Post[]> => {
  const id = await userId();
  // Filtered by author although the policy already does it: step 2 widens the
  // policy to followers, and this list must stay "mine".
  const { data, error } = await client()
    .from('posts')
    .select(POST_COLUMNS)
    .eq('author_id', id)
    .order('created_at', { ascending: false });
  if (error) fail(error);
  // `numeric` can arrive as a string; the views do arithmetic on it.
  return (data ?? []).map((post) => ({
    ...post,
    volume_kg: post.volume_kg === null ? null : Number(post.volume_kg),
  })) as Post[];
};

export const deletePost = async (id: string): Promise<void> => {
  const { error } = await client().from('posts').delete().eq('id', id);
  if (error) fail(error);
};

export const deleteAccount = async (): Promise<void> => {
  const { error } = await client().rpc('delete_account');
  if (error) fail(error);
  // The user no longer exists on the server; only the local copy of the session is left to drop.
  // The account is already gone, so a failure here must not be reported as a failed deletion.
  await client().auth.signOut({ scope: 'local' }).catch(() => undefined);
};
