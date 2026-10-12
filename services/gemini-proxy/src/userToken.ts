/**
 * Who is calling, from the Supabase access token the app sends.
 *
 * Verified with Node's built-in WebCrypto against the project's published
 * signing key, so the proxy needs no secret for this and no dependency. The
 * token's `sub` is the only thing the rest of the service takes from it.
 */

export type TokenCheck =
  | { userId: string }
  | { problem: 'missing' | 'expired' | 'invalid'; keysUnavailable?: true };

/**
 * Past `exp` by this much still counts. Phones and servers disagree about the
 * time by a few seconds, and a signed-in person must not be bounced to an
 * "expired" refresh over that.
 */
const EXPIRY_LEEWAY_MS = 30_000;

/**
 * An unknown `kid` means the project rotated its key, or someone is guessing.
 * Refetching on every such token would let a stranger turn this service into a
 * stream of requests to Supabase, so the keys are fetched at most this often.
 * The same spacing applies after a failed fetch, for the same reason.
 */
const REFETCH_INTERVAL_MS = 60_000;

const invalid = { problem: 'invalid' } as const;

type KeySet = Map<string, CryptoKey>;

const decodeJson = (segment: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const createTokenVerifier = (opts: {
  supabaseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) => {
  const issuer = `${opts.supabaseUrl}/auth/v1`;
  const jwksUrl = `${issuer}/.well-known/jwks.json`;
  const now = opts.now ?? Date.now;
  // Resolved at call time so a test (or a runtime) that swaps the global fetch
  // is honoured.
  const fetchJwks = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  let keys: KeySet = new Map();
  let lastAttemptAt: number | null = null;
  let inFlight: Promise<void> | null = null;

  const importKeys = async (body: unknown): Promise<KeySet> => {
    const imported: KeySet = new Map();
    const list = (body as { keys?: unknown } | null)?.keys;
    if (!Array.isArray(list)) return imported;
    for (const jwk of list as Record<string, unknown>[]) {
      if (typeof jwk?.kid !== 'string' || jwk.kty !== 'EC' || jwk.crv !== 'P-256') continue;
      try {
        imported.set(
          jwk.kid,
          await crypto.subtle.importKey(
            'jwk',
            jwk as JsonWebKey,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
          ),
        );
      } catch {
        // One malformed key must not discard the others.
      }
    }
    return imported;
  };

  /** Fetches the key set; on any failure the previous one is kept as it was. */
  const refresh = (): Promise<void> => {
    // Concurrent first requests share one fetch rather than each making their own.
    if (inFlight) return inFlight;
    lastAttemptAt = now();
    inFlight = (async () => {
      try {
        const response = await fetchJwks(jwksUrl);
        if (!response.ok) return;
        const fresh = await importKeys(await response.json());
        if (fresh.size > 0) keys = fresh;
      } catch {
        // Keep whatever is cached. The caller finds out through the lookup.
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const mayRefetch = (): boolean =>
    lastAttemptAt === null || now() - lastAttemptAt >= REFETCH_INTERVAL_MS;

  const keyFor = async (kid: string): Promise<CryptoKey | undefined> => {
    if (!keys.has(kid) && (inFlight || mayRefetch())) await refresh();
    return keys.get(kid);
  };

  const check = async (authorization: string | null): Promise<TokenCheck> => {
    const bearer = authorization === null ? null : /^Bearer\s+(\S+)\s*$/i.exec(authorization);
    if (!bearer?.[1]) return { problem: 'missing' };

    const parts = bearer[1].split('.');
    if (parts.length !== 3) return invalid;
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

    const header = decodeJson(headerPart);
    const claims = decodeJson(payloadPart);
    if (!header || !claims) return invalid;
    // Pinned, never read from the token to choose an algorithm: that is how
    // `none` and HS256-with-the-public-key forgeries work.
    if (header.alg !== 'ES256' || typeof header.kid !== 'string') return invalid;

    const key = await keyFor(header.kid);
    if (!key) {
      // Nothing cached and Supabase unreachable is an outage on their side, not
      // a bad token. The router lets those callers through as signed out.
      return keys.size === 0 ? { problem: 'invalid', keysUnavailable: true } : invalid;
    }

    const signature = Buffer.from(signaturePart, 'base64url');
    if (signature.length !== 64) return invalid;
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    if (!verified) return invalid;

    if (claims.iss !== issuer) return invalid;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes('authenticated')) return invalid;
    if (typeof claims.sub !== 'string' || claims.sub === '') return invalid;
    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) return invalid;
    if (now() > claims.exp * 1000 + EXPIRY_LEEWAY_MS) return { problem: 'expired' };

    return { userId: claims.sub };
  };

  return { check };
};
