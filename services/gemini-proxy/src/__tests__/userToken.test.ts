import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createTokenVerifier } from '../userToken.js';
import {
  KID,
  SUPABASE_URL,
  createTestKeys,
  supabaseClaims,
  type TestKeys,
} from './tokenFixtures.js';

const NOW = 1_800_000_000_000;

let keys: TestKeys;
beforeAll(async () => {
  keys = await createTestKeys();
});

const jwksResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** A verifier whose JWKS fetch is a spy, so the tests can count fetches. */
const setup = (jwks: () => Response | Promise<Response> = () => jwksResponse(keys.jwks)) => {
  const fetchImpl = vi.fn(async () => jwks());
  let at = NOW;
  const verifier = createTokenVerifier({
    supabaseUrl: SUPABASE_URL,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => at,
  });
  return {
    verifier,
    fetchImpl,
    advance: (ms: number) => {
      at += ms;
    },
  };
};

const bearer = (token: string) => `Bearer ${token}`;

describe('createTokenVerifier', () => {
  it('returns the user id of a valid token', async () => {
    const { verifier } = setup();
    const token = await keys.sign(supabaseClaims(NOW));

    expect(await verifier.check(bearer(token))).toEqual({ userId: 'user-1' });
  });

  it('accepts an aud that is an array containing authenticated', async () => {
    const { verifier } = setup();
    const token = await keys.sign(supabaseClaims(NOW, { aud: ['other', 'authenticated'] }));

    expect(await verifier.check(bearer(token))).toEqual({ userId: 'user-1' });
  });

  it('asks for the key at the project JWKS address', async () => {
    const { verifier, fetchImpl } = setup();
    await verifier.check(bearer(await keys.sign(supabaseClaims(NOW))));

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
  });

  describe('missing', () => {
    it('is reported for no header at all', async () => {
      const { verifier } = setup();
      expect(await verifier.check(null)).toEqual({ problem: 'missing' });
    });

    it('is reported for a header that is not a Bearer one', async () => {
      const { verifier } = setup();
      expect(await verifier.check('Basic dXNlcjpwYXNz')).toEqual({ problem: 'missing' });
      expect(await verifier.check('Bearer ')).toEqual({ problem: 'missing' });
    });

    it('does not fetch keys for a request that has no token', async () => {
      const { verifier, fetchImpl } = setup();
      await verifier.check(null);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('expiry', () => {
    it('is expired once past the 30 second leeway', async () => {
      const { verifier } = setup();
      const token = await keys.sign(supabaseClaims(NOW, { exp: Math.floor(NOW / 1000) - 31 }));

      expect(await verifier.check(bearer(token))).toEqual({ problem: 'expired' });
    });

    it('is still fine within the leeway', async () => {
      const { verifier } = setup();
      const token = await keys.sign(supabaseClaims(NOW, { exp: Math.floor(NOW / 1000) - 20 }));

      expect(await verifier.check(bearer(token))).toEqual({ userId: 'user-1' });
    });

    it('follows the clock it is given', async () => {
      const { verifier, advance } = setup();
      const token = await keys.sign(supabaseClaims(NOW));
      expect(await verifier.check(bearer(token))).toEqual({ userId: 'user-1' });

      advance(3600_000 + 31_000);
      expect(await verifier.check(bearer(token))).toEqual({ problem: 'expired' });
    });

    it('is invalid, not expired, when exp is missing', async () => {
      const { verifier } = setup();
      const token = await keys.sign(supabaseClaims(NOW, { exp: undefined }));

      expect(await verifier.check(bearer(token))).toEqual({ problem: 'invalid' });
    });
  });

  describe('invalid', () => {
    it('rejects a token from a different issuer', async () => {
      const { verifier } = setup();
      const token = await keys.sign(supabaseClaims(NOW, { iss: 'https://evil.supabase.co/auth/v1' }));

      expect(await verifier.check(bearer(token))).toEqual({ problem: 'invalid' });
    });

    it('rejects the wrong audience', async () => {
      const { verifier } = setup();
      const token = await keys.sign(supabaseClaims(NOW, { aud: 'anon' }));

      expect(await verifier.check(bearer(token))).toEqual({ problem: 'invalid' });
    });

    it('rejects a token with no subject', async () => {
      const { verifier } = setup();
      const token = await keys.sign(supabaseClaims(NOW, { sub: '' }));

      expect(await verifier.check(bearer(token))).toEqual({ problem: 'invalid' });
    });

    it('rejects HS256', async () => {
      const { verifier } = setup();
      const token = await keys.sign(supabaseClaims(NOW), { alg: 'HS256' });

      expect(await verifier.check(bearer(token))).toEqual({ problem: 'invalid' });
    });

    it('rejects alg none, with or without a signature', async () => {
      const { verifier } = setup();
      const token = await keys.sign(supabaseClaims(NOW), { alg: 'none' });
      const [header, payload] = token.split('.');

      expect(await verifier.check(bearer(token))).toEqual({ problem: 'invalid' });
      expect(await verifier.check(bearer(`${header}.${payload}.`))).toEqual({ problem: 'invalid' });
    });

    it('rejects a payload changed after signing', async () => {
      const { verifier } = setup();
      const token = await keys.sign(supabaseClaims(NOW));
      const [header, , signature] = token.split('.');
      const forged = Buffer.from(JSON.stringify(supabaseClaims(NOW, { sub: 'someone-else' }))).toString(
        'base64url',
      );

      expect(await verifier.check(bearer(`${header}.${forged}.${signature}`))).toEqual({
        problem: 'invalid',
      });
    });

    it('rejects a token signed by a different key that claims the same kid', async () => {
      const { verifier } = setup();
      const other = await createTestKeys(KID);
      const token = await other.sign(supabaseClaims(NOW));

      expect(await verifier.check(bearer(token))).toEqual({ problem: 'invalid' });
    });

    it('rejects an unknown kid even after refetching', async () => {
      const { verifier, fetchImpl } = setup();
      const other = await createTestKeys('rotated-away');
      const token = await other.sign(supabaseClaims(NOW));

      expect(await verifier.check(bearer(token))).toEqual({ problem: 'invalid' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('rejects garbage', async () => {
      const { verifier } = setup();
      for (const junk of ['abc', 'a.b', 'a.b.c', '...', 'not.base64!.at-all']) {
        expect(await verifier.check(bearer(junk))).toEqual({ problem: 'invalid' });
      }
    });
  });

  describe('key cache', () => {
    it('fetches the keys once for many checks', async () => {
      const { verifier, fetchImpl } = setup();
      const token = await keys.sign(supabaseClaims(NOW));

      for (let i = 0; i < 5; i += 1) await verifier.check(bearer(token));

      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('fetches once when concurrent first checks arrive together', async () => {
      const { verifier, fetchImpl } = setup();
      const token = await keys.sign(supabaseClaims(NOW));

      await Promise.all([1, 2, 3].map(() => verifier.check(bearer(token))));

      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('refetches once for an unknown kid and then accepts the rotated-in key', async () => {
      const rotated = await createTestKeys('key-2');
      let served: unknown = keys.jwks;
      const { verifier, fetchImpl, advance } = setup(() => jwksResponse(served));

      await verifier.check(bearer(await keys.sign(supabaseClaims(NOW))));
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      served = { keys: [...keys.jwks.keys, ...rotated.jwks.keys] };
      advance(61_000);
      const result = await verifier.check(bearer(await rotated.sign(supabaseClaims(NOW + 61_000))));

      expect(result).toEqual({ userId: 'user-1' });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('refetches for an unknown kid at most once a minute', async () => {
      const { verifier, fetchImpl, advance } = setup();
      const stranger = await createTestKeys('never-published');
      const token = await stranger.sign(supabaseClaims(NOW));

      await verifier.check(bearer(token));
      await verifier.check(bearer(token));
      await verifier.check(bearer(token));
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      advance(61_000);
      await verifier.check(bearer(token));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('keeps using cached keys when a refetch fails', async () => {
      let down = false;
      const { verifier, advance } = setup(() =>
        down ? new Response('bad gateway', { status: 502 }) : jwksResponse(keys.jwks),
      );
      const token = await keys.sign(supabaseClaims(NOW));
      expect(await verifier.check(bearer(token))).toEqual({ userId: 'user-1' });

      down = true;
      advance(61_000);
      const stranger = await createTestKeys('never-published');
      await verifier.check(bearer(await stranger.sign(supabaseClaims(NOW))));

      expect(await verifier.check(bearer(token))).toEqual({ userId: 'user-1' });
    });

    it('is invalid, flagged as keys-unavailable, when the fetch fails and nothing is cached', async () => {
      const { verifier } = setup(() => new Response('bad gateway', { status: 502 }));
      const token = await keys.sign(supabaseClaims(NOW));

      expect(await verifier.check(bearer(token))).toEqual({
        problem: 'invalid',
        keysUnavailable: true,
      });
    });

    it('is also keys-unavailable when the fetch throws', async () => {
      const { verifier } = setup(() => {
        throw new Error('network down');
      });
      const token = await keys.sign(supabaseClaims(NOW));

      expect(await verifier.check(bearer(token))).toEqual({
        problem: 'invalid',
        keysUnavailable: true,
      });
    });

    it('tries again after an outage once the retry interval has passed', async () => {
      let down = true;
      const { verifier, advance } = setup(() =>
        down ? new Response('bad gateway', { status: 502 }) : jwksResponse(keys.jwks),
      );
      const token = await keys.sign(supabaseClaims(NOW));
      await verifier.check(bearer(token));

      down = false;
      advance(61_000);

      expect(await verifier.check(bearer(token))).toEqual({ userId: 'user-1' });
    });
  });
});
