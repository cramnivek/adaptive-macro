import { describe, expect, it } from 'vitest';
import { isAlreadyPosted, messageFor } from '../errors';
import { normaliseProfile, profileProblem } from '../profileRules';

const fields = (username: string, displayName = 'Marc', instagram = '') =>
  normaliseProfile({ username, displayName, instagram });

describe('normaliseProfile', () => {
  it('lower-cases the username and drops a typed @ from both handles', () => {
    expect(normaliseProfile({ username: ' @Marc.K ', displayName: ' Marc ', instagram: '@marc_k' })).toEqual({
      username: 'marc.k',
      display_name: 'Marc',
      instagram: 'marc_k',
    });
  });

  it('stores no Instagram handle when none was given', () => {
    expect(fields('marc').instagram).toBeNull();
  });
});

describe('profileProblem', () => {
  it('accepts a profile inside the rules', () => {
    expect(profileProblem(fields('marc_k.99', 'Marc', 'Marc.K'))).toBeNull();
  });

  it('refuses a username too short, too long, or with other characters', () => {
    for (const username of ['ab', 'a'.repeat(21), 'marc-k', 'marc k']) {
      expect(profileProblem(fields(username))).toBe('A username is 3 to 20 lower-case letters, numbers, _ or .');
    }
  });

  it('refuses an empty or overlong name', () => {
    expect(profileProblem(fields('marc', ' '))).toBe('A name is 1 to 40 characters.');
    expect(profileProblem(fields('marc', 'x'.repeat(41)))).toBe('A name is 1 to 40 characters.');
  });

  it('refuses something that is not an Instagram handle', () => {
    expect(profileProblem(fields('marc', 'Marc', 'instagram.com/marc!'))).toBe(
      'That is not an Instagram handle: up to 30 letters, numbers, _ or .',
    );
  });
});

describe('messageFor', () => {
  it('names a taken username', () => {
    expect(
      messageFor({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' }),
    ).toBe('That username is taken.');
  });

  it('explains a wrong or expired code', () => {
    expect(messageFor({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toBe(
      'That code is wrong or has expired. Check it, or send a new one.',
    );
  });

  it('explains too many codes', () => {
    expect(messageFor({ code: 'over_email_send_rate_limit', status: 429 })).toBe(
      'Too many codes sent. Wait a few minutes and try again.',
    );
  });

  it('explains being offline', () => {
    expect(messageFor({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe(
      'Could not reach the server. Check the connection and try again.',
    );
    expect(messageFor({ message: 'TypeError: Failed to fetch' })).toBe(
      'Could not reach the server. Check the connection and try again.',
    );
  });

  it('explains being offline in Safari and Firefox', () => {
    expect(messageFor({ message: 'Load failed' })).toBe(
      'Could not reach the server. Check the connection and try again.',
    );
    expect(messageFor({ message: 'NetworkError when attempting to fetch resource.' })).toBe(
      'Could not reach the server. Check the connection and try again.',
    );
  });

  it('asks for a username when a post has no profile to belong to', () => {
    expect(
      messageFor({ code: '23503', message: 'insert or update on table "posts" violates foreign key constraint "posts_author_id_fkey"' }),
    ).toBe('Choose a username before posting.');
  });

  it('asks to sign in again when the token has expired', () => {
    expect(messageFor({ code: 'PGRST301', message: 'JWSError JWSInvalidSignature' })).toBe(
      'You are signed out. Sign in and try again.',
    );
    expect(messageFor({ code: 'PGRST303', message: 'JWT expired' })).toBe(
      'You are signed out. Sign in and try again.',
    );
    expect(messageFor({ message: 'JWT expired' })).toBe('You are signed out. Sign in and try again.');
  });

  it('does not show database text for any other database or PostgREST code', () => {
    expect(messageFor({ code: '42501', message: 'new row violates row-level security policy for table "posts"' })).toBe(
      'Could not save that. Try again.',
    );
    expect(messageFor({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(
      'Could not save that. Try again.',
    );
  });

  it('passes anything else through as the server said it', () => {
    expect(messageFor({ message: 'Something specific' })).toBe('Something specific');
    expect(messageFor({})).toBe('Something went wrong. Try again.');
  });
});

describe('isAlreadyPosted', () => {
  it('recognises the second copy of the same workout', () => {
    expect(
      isAlreadyPosted({ code: '23505', message: 'duplicate key value violates unique constraint "posts_author_id_session_id_key"' }),
    ).toBe(true);
    expect(isAlreadyPosted({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' })).toBe(false);
  });
});
