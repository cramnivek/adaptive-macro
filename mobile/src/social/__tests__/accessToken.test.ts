import { beforeEach, describe, expect, it, vi } from 'vitest';

// client.ts needs react-native; what these tests care about is how the helpers
// treat whatever the Supabase client does.
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));
const client = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../client', () => ({
  get supabase() {
    return client.current;
  },
}));

import { currentAccessToken, refreshAccessToken } from '../api';

beforeEach(() => {
  auth.getSession.mockReset();
  auth.refreshSession.mockReset();
  client.current = { auth };
});

describe('currentAccessToken', () => {
  it("returns the signed-in person's access token", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-1' } } });

    expect(await currentAccessToken()).toBe('jwt-1');
  });

  it('returns null when signed out', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });

    expect(await currentAccessToken()).toBeNull();
  });

  it('returns null, not a throw, when this build has no sign-in', async () => {
    client.current = null;

    expect(await currentAccessToken()).toBeNull();
  });

  it('returns null, not a throw, when reading the session fails', async () => {
    auth.getSession.mockRejectedValue(new Error('storage unavailable'));

    expect(await currentAccessToken()).toBeNull();
  });
});

describe('refreshAccessToken', () => {
  it('returns the new access token', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'jwt-2' } }, error: null });

    expect(await refreshAccessToken()).toBe('jwt-2');
  });

  it('returns null when the refresh is refused', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('refresh token revoked') });

    expect(await refreshAccessToken()).toBeNull();
  });

  it('returns null, not a throw, when offline or signed-in is not set up', async () => {
    auth.refreshSession.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await refreshAccessToken()).toBeNull();

    client.current = null;
    expect(await refreshAccessToken()).toBeNull();
  });
});
