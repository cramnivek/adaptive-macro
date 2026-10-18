import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';
import { isAlreadyPosted, messageFor, OFFLINE, type ServerError } from './errors';
import type { PostRow } from './postPayload';
import type { ProfileFields } from './profileRules';
import type { Post, Profile } from './types';

/**
 * Every call the screens make to Supabase.
 *
 * Each one throws an Error whose message is ready to show, so a screen catches
 * and displays it and never has to know what Postgres or the auth server said.
 */

export const BASE_PROFILE_COLUMNS = 'id, username, display_name, instagram, is_private';
export const EXTENDED_PROFILE_COLUMNS =
  'id, username, display_name, instagram, is_private, avatar_url, bio, training_focus, pr_highlight';
export const PROFILE_COLUMNS = EXTENDED_PROFILE_COLUMNS;
const POST_COLUMNS =
  'id, author_id, session_id, title, performed_on, duration_min, sets, volume_kg, exercises, highlight, caption, created_at';

const PROFILE_EXTRA_KEY_PREFIX = 'ascend_profile_extra_';

export interface ProfileExtraFields {
  avatar_url?: string | null;
  bio?: string | null;
  training_focus?: string | null;
  pr_highlight?: string | null;
}

export const isMissingColumnError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const error = err as { code?: string; message?: string; details?: string; hint?: string };
  const str = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    str.includes('schema cache') ||
    str.includes('could not find the') ||
    (str.includes('column') &&
      (str.includes('not exist') || str.includes('not found') || str.includes('unknown') || str.includes('missing')))
  );
};

export const getCachedProfileExtra = async (id: string): Promise<ProfileExtraFields | null> => {
  try {
    const json = await AsyncStorage.getItem(`${PROFILE_EXTRA_KEY_PREFIX}${id}`);
    if (!json) return null;
    return JSON.parse(json) as ProfileExtraFields;
  } catch {
    return null;
  }
};

export const setCachedProfileExtra = async (id: string, extra: ProfileExtraFields): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${PROFILE_EXTRA_KEY_PREFIX}${id}`, JSON.stringify(extra));
  } catch {
    // Best-effort storage
  }
};

export const client = (): SupabaseClient => {
  if (supabase === null) throw new Error('Sign-in is not set up in this build.');
  return supabase;
};

export function fail(error: ServerError): never {
  throw new Error(messageFor(error));
}

export const userId = async (): Promise<string> => {
  const { data } = await client().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('You are signed out. Sign in and try again.');
  return id;
};

/**
 * The signed-in person's access token, which the AI proxy uses to count their
 * calls separately from everyone else's.
 *
 * Null when signed out or when this build has no sign-in, and never a throw: an
 * AI request without a token is still a valid request, answered from the shared
 * signed-out allowance, so failing to read one must not fail the request.
 */
export const currentAccessToken = async (): Promise<string | null> => {
  try {
    const { data } = await client().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
};

/**
 * A fresh access token, for when the proxy says the one it was sent has
 * expired. Same contract as `currentAccessToken`: null on any failure.
 */
export const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const { data } = await client().auth.refreshSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
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
  // The global sign-out asks the server first, so offline it fails and would leave the person
  // signed in on a phone that may be shared. Dropping the local session is what matters then.
  if (error && messageFor(error) === OFFLINE) {
    const local = await client().auth.signOut({ scope: 'local' });
    if (local.error) fail(local.error);
    return;
  }
  if (error) fail(error);
};

export const myProfile = async (): Promise<Profile | null> => {
  const id = await userId();
  const cachedExtra = await getCachedProfileExtra(id);

  const { data, error } = await client().from('profiles').select(EXTENDED_PROFILE_COLUMNS).eq('id', id).maybeSingle();
  if (!error) {
    if (!data) return null;
    const profile = data as Profile;
    const merged: Profile = {
      ...profile,
      avatar_url: profile.avatar_url ?? cachedExtra?.avatar_url ?? null,
      bio: profile.bio ?? cachedExtra?.bio ?? null,
      training_focus: profile.training_focus ?? cachedExtra?.training_focus ?? null,
      pr_highlight: profile.pr_highlight ?? cachedExtra?.pr_highlight ?? null,
    };
    void setCachedProfileExtra(id, {
      avatar_url: merged.avatar_url,
      bio: merged.bio,
      training_focus: merged.training_focus,
      pr_highlight: merged.pr_highlight,
    });
    return merged;
  }

  if (isMissingColumnError(error)) {
    const { data: baseData, error: baseError } = await client()
      .from('profiles')
      .select(BASE_PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (baseError) fail(baseError);
    if (!baseData) return null;
    return {
      ...(baseData as Profile),
      avatar_url: cachedExtra?.avatar_url ?? null,
      bio: cachedExtra?.bio ?? null,
      training_focus: cachedExtra?.training_focus ?? null,
      pr_highlight: cachedExtra?.pr_highlight ?? null,
    };
  }

  fail(error);
};

export const saveProfile = async (fields: ProfileFields & { is_private: boolean }): Promise<Profile> => {
  const id = await userId();
  const extra: ProfileExtraFields = {
    avatar_url: fields.avatar_url ?? null,
    bio: fields.bio ?? null,
    training_focus: fields.training_focus ?? null,
    pr_highlight: fields.pr_highlight ?? null,
  };
  await setCachedProfileExtra(id, extra);

  try {
    const { data, error } = await client()
      .from('profiles')
      .upsert({ id, ...fields })
      .select(EXTENDED_PROFILE_COLUMNS)
      .single();

    if (!error && data) {
      return data as Profile;
    }

    if (error && !isMissingColumnError(error)) {
      fail(error);
    }
  } catch (err) {
    if (!isMissingColumnError(err)) {
      throw err;
    }
  }

  // Fallback: save base columns that exist on all schema versions
  const baseFields = {
    id,
    username: fields.username,
    display_name: fields.display_name,
    instagram: fields.instagram,
    is_private: fields.is_private,
  };
  const { data: baseData, error: baseError } = await client()
    .from('profiles')
    .upsert(baseFields)
    .select(BASE_PROFILE_COLUMNS)
    .single();

  if (baseError) fail(baseError);

  return {
    ...(baseData as Profile),
    ...extra,
  };
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
