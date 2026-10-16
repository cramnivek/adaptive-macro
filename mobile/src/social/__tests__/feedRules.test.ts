import { describe, expect, it } from 'vitest';
import { cursorAfter, escapeSearch, followStateFor, toFeedPost } from '../feedRules';

describe('escapeSearch', () => {
  it('lower-cases, trims, drops a typed @, and escapes the LIKE wildcards', () => {
    expect(escapeSearch('  @Bo_b% ')).toBe('bo\\_b\\%');
  });
  it('asks for at least two characters, since one matches half the app', () => {
    expect(escapeSearch('b')).toBeNull();
    expect(escapeSearch('  ')).toBeNull();
  });
  it('refuses characters no username can contain', () => {
    expect(escapeSearch('bob!')).toBeNull();
  });
});

describe('toFeedPost', () => {
  it('turns numeric strings into numbers and keeps the author', () => {
    const post = toFeedPost({
      id: 'p', author_id: 'a', session_id: 's', title: 'Push', performed_on: '2026-10-12', duration_min: 45,
      sets: 5, volume_kg: '2400', exercises: [], highlight: null, caption: null, created_at: '2026-10-12T10:00:00Z',
      username: 'bob', display_name: 'Bob', like_count: '3', liked: true,
    });
    expect(post).toMatchObject({ volume_kg: 2400, like_count: 3, liked: true, username: 'bob' });
  });
});

describe('followStateFor', () => {
  it('reads the button off the follow row', () => {
    expect(followStateFor('me', 'me', null)).toBe('self');
    expect(followStateFor('me', 'them', null)).toBe('none');
    expect(followStateFor('me', 'them', { status: 'pending' })).toBe('requested');
    expect(followStateFor('me', 'them', { status: 'accepted' })).toBe('following');
  });
});

describe('cursorAfter', () => {
  it('is null for an empty page, so there is nothing to ask for next', () => {
    expect(cursorAfter([])).toBeNull();
  });
  it('is the time and id of the last post, so posts at the same moment are never skipped', () => {
    const post = (id: string, created_at: string) => ({ id, created_at }) as Parameters<typeof cursorAfter>[0][number];
    expect(cursorAfter([post('a', '2026-10-12T10:00:00Z'), post('b', '2026-10-12T09:00:00Z')])).toEqual({
      at: '2026-10-12T09:00:00Z',
      id: 'b',
    });
  });
});
