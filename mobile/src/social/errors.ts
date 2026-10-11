/**
 * Supabase failures in words someone can act on.
 *
 * Auth errors carry a `code` such as `otp_expired`; database errors carry the
 * Postgres code and the constraint's name in the message, which is how a taken
 * username is told apart from a workout already posted.
 */

export interface ServerError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

export const OFFLINE = 'Could not reach the server. Check the connection and try again.';

export const isAlreadyPosted = (error: ServerError): boolean =>
  error.code === '23505' && (error.message?.includes('posts_author_id_session_id_key') ?? false);

export const messageFor = (error: ServerError): string => {
  if (error.code === '23505' && error.message?.includes('profiles_username_key')) return 'That username is taken.';
  if (error.code === 'otp_expired') return 'That code is wrong or has expired. Check it, or send a new one.';
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many codes sent. Wait a few minutes and try again.';
  }
  // A 5xx came from a server that was reached, so it is never "offline" — supabase-js can
  // still label it a retryable fetch error, which is why this comes first.
  if ((error.status ?? 0) >= 500) {
    return error.message?.includes('sending') && error.message.includes('email')
      ? 'The sign-in email could not be sent. Try again in a few minutes.'
      : 'Something went wrong on the server. Try again in a few minutes.';
  }
  if (
    error.name === 'AuthRetryableFetchError' ||
    error.message?.includes('Failed to fetch') ||
    error.message?.includes('Network request failed') ||
    // Safari, which includes the iOS home-screen app, and Firefox word it their own way.
    error.message?.includes('Load failed') ||
    error.message?.includes('NetworkError when attempting to fetch resource')
  ) {
    return OFFLINE;
  }
  if (error.code === '23503') return 'Choose a username before posting.';
  if (error.code === 'PGRST301' || error.message?.includes('JWT expired')) {
    return 'You are signed out. Sign in and try again.';
  }
  // Postgres codes are five characters of digits and capitals; PostgREST's start with PGRST.
  // Their messages are database text, so they are never shown. Auth errors have no such code.
  if (error.code !== undefined && (/^[0-9A-Z]{5}$/.test(error.code) || error.code.startsWith('PGRST'))) {
    return 'Could not save that. Try again.';
  }
  return error.message?.trim() || 'Something went wrong. Try again.';
};
