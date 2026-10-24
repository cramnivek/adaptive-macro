import { describe, expect, it } from 'vitest';
import { isAlreadyPosted, messageFor } from '../errors';
import { missingOnServer, normaliseProfile, profileProblem } from '../profileRules';

const fields = (username: string, displayName = 'Marc', instagram = '') =>
  normaliseProfile({ username, displayName, instagram });

describe('normaliseProfile', () => {
  it('lower-cases the username and drops a typed @ from both handles', () => {
    expect(normaliseProfile({ username: ' @Marc.K ', displayName: ' Marc ', instagram: '@marc_k' })).toEqual({
      username: 'marc.k',
      display_name: 'Marc',
      instagram: 'marc_k',
      avatar_url: null,
      bio: null,
      training_focus: null,
      pr_highlight: null,
    });
  });

  it('normalises extended profile fields', () => {
    expect(
      normaliseProfile({
        username: 'alex',
        displayName: 'Alex',
        instagram: '',
        avatarUrl: ' preset:fire ',
        bio: ' Heavy lifter ',
        trainingFocus: ' Hypertrophy ',
        prHighlight: ' 500 lb Deadlift ',
      }),
    ).toEqual({
      username: 'alex',
      display_name: 'Alex',
      instagram: null,
      avatar_url: 'preset:fire',
      bio: 'Heavy lifter',
      training_focus: 'Hypertrophy',
      pr_highlight: '500 lb Deadlift',
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

  it('accepts valid extended profile fields', () => {
    expect(
      profileProblem({
        username: 'marc_k.99',
        display_name: 'Marc',
        instagram: null,
        avatar_url: 'preset:barbell',
        bio: 'Focusing on strength and progressive overload.',
        training_focus: 'Powerlifting',
        pr_highlight: '405 Squat / 315 Bench',
      }),
    ).toBeNull();
  });

  it('refuses an overlong bio, training focus, or PR highlight', () => {
    expect(
      profileProblem({
        username: 'marc',
        display_name: 'Marc',
        instagram: null,
        bio: 'a'.repeat(241),
      }),
    ).toBe('A bio must be 240 characters or less.');

    expect(
      profileProblem({
        username: 'marc',
        display_name: 'Marc',
        instagram: null,
        training_focus: 'x'.repeat(61),
      }),
    ).toBe('Training focus must be 60 characters or less.');

    expect(
      profileProblem({
        username: 'marc',
        display_name: 'Marc',
        instagram: null,
        pr_highlight: 'y'.repeat(81),
      }),
    ).toBe('PR highlight must be 80 characters or less.');
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

  it('says the sign-in email failed, not that the phone is offline', () => {
    // A server that answered with 500 was reached; blaming the connection sends people to check the wrong thing.
    expect(
      messageFor({ name: 'AuthApiError', status: 500, code: 'unexpected_failure', message: 'Error sending magic link email' }),
    ).toBe('The sign-in email could not be sent. Try again in a few minutes.');
    expect(messageFor({ name: 'AuthRetryableFetchError', status: 500, message: '{}' })).toBe(
      'Something went wrong on the server. Try again in a few minutes.',
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

  it('does not take any unique violation that merely mentions "session" for a repeat post', () => {
    expect(
      isAlreadyPosted({ code: '23505', message: 'duplicate key value violates unique constraint "sessions_device_session_key"' }),
    ).toBe(false);
  });
});

describe('messageFor on a filtered word', () => {
  it('says the text has a word the app does not allow', () => {
    expect(messageFor({ code: 'P0001', message: 'blocked_word' })).toBe('That has a word Stärke doesn’t allow. Change it and try again.');
  });
});

describe('missingOnServer', () => {
  const server = { avatar_url: null, bio: 'Lifts', training_focus: null, pr_highlight: null };

  it('names what only this device kept, so it can be sent', () => {
    expect(missingOnServer(server, { avatar_url: 'data:image/jpeg;base64,AAAA', bio: 'Old', training_focus: null })).toEqual({
      avatar_url: 'data:image/jpeg;base64,AAAA',
    });
  });

  it('never replaces what the server already has', () => {
    expect(missingOnServer(server, { bio: 'Old' })).toBeNull();
  });

  it('has nothing to send without a cached copy', () => {
    expect(missingOnServer(server, null)).toBeNull();
  });
});
