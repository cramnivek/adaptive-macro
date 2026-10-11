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

const OFFLINE = 'Could not reach the server. Check the connection and try again.';

export const isAlreadyPosted = (error: ServerError): boolean =>
  error.code === '23505' && (error.message?.includes('session') ?? false);

export const messageFor = (error: ServerError): string => {
  if (error.code === '23505' && error.message?.includes('username')) return 'That username is taken.';
  if (error.code === 'otp_expired') return 'That code is wrong or has expired. Check it, or send a new one.';
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many codes sent. Wait a few minutes and try again.';
  }
  if (
    error.name === 'AuthRetryableFetchError' ||
    error.message?.includes('Failed to fetch') ||
    error.message?.includes('Network request failed')
  ) {
    return OFFLINE;
  }
  return error.message?.trim() || 'Something went wrong. Try again.';
};
