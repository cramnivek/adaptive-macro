/*
  Test-only: a throwaway ES256 key pair, the JWKS that publishes it, and a
  signer for Supabase-shaped access tokens. Shared by the verifier's tests and
  the router's, so both exercise the same real signature path rather than a
  stub that always says yes.
*/

export const SUPABASE_URL = 'https://proj.supabase.co';
export const KID = 'test-key-1';

const b64url = (input: ArrayBuffer | string): string =>
  Buffer.from(typeof input === 'string' ? input : new Uint8Array(input)).toString('base64url');

export interface TestKeys {
  jwks: { keys: Record<string, unknown>[] };
  /** Signs `claims` with this pair; `header` overrides the JWS header fields. */
  sign: (claims: Record<string, unknown>, header?: Record<string, unknown>) => Promise<string>;
}

export const createTestKeys = async (kid: string = KID): Promise<TestKeys> => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);

  return {
    jwks: { keys: [{ ...publicJwk, kid, alg: 'ES256', use: 'sig' }] },
    sign: async (claims, header = {}) => {
      const signingInput = `${b64url(
        JSON.stringify({ alg: 'ES256', typ: 'JWT', kid, ...header }),
      )}.${b64url(JSON.stringify(claims))}`;
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        new TextEncoder().encode(signingInput),
      );
      return `${signingInput}.${b64url(signature)}`;
    },
  };
};

/** The claims Supabase puts in an access token, valid for an hour from `nowMs`. */
export const supabaseClaims = (
  nowMs: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  iss: `${SUPABASE_URL}/auth/v1`,
  aud: 'authenticated',
  sub: 'user-1',
  exp: Math.floor(nowMs / 1000) + 3600,
  ...overrides,
});
