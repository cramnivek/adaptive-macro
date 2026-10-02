/**
 * Per-caller request limits.
 *
 * `PROXY_TOKEN` is inlined into the client bundle by Expo — it has to be, the
 * browser needs it to call this service — so anyone who opens the deployed
 * page can read it out of the JavaScript and spend the Gemini key behind it.
 * That is survivable for a single-user app and not survivable with users.
 *
 * This does not fix that; only per-user credentials can, and that is a larger
 * piece of work. What it does is cap what one extracted token is worth: an
 * abuser gets a trickle instead of a tap, and the bill stays bounded while the
 * real fix is built.
 *
 * A sliding window rather than fixed buckets, so a caller cannot spend a whole
 * allowance at 10:59 and another at 11:00.
 */
export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Whole seconds until the oldest hit falls out of the window. */
  retryAfterSeconds: number;
}

/**
 * Beyond this many tracked callers, a check also sweeps out the ones whose
 * window has fully expired. Sweeping on every request would be a scan per
 * call; never sweeping would grow forever on a long-lived container.
 */
const SWEEP_THRESHOLD = 1_000;

export const createRateLimiter = (rule: RateLimitRule, now: () => number = Date.now) => {
  const hits = new Map<string, number[]>();

  const prune = (timestamps: number[], cutoff: number): number[] => {
    // Timestamps are appended in order, so the survivors are a suffix.
    let first = 0;
    while (first < timestamps.length && (timestamps[first] ?? 0) <= cutoff) first += 1;
    return first === 0 ? timestamps : timestamps.slice(first);
  };

  return {
    check(key: string): RateLimitVerdict {
      const at = now();
      const cutoff = at - rule.windowMs;

      if (hits.size > SWEEP_THRESHOLD) {
        for (const [other, timestamps] of hits) {
          if ((timestamps[timestamps.length - 1] ?? 0) <= cutoff) hits.delete(other);
        }
      }

      const recent = prune(hits.get(key) ?? [], cutoff);

      if (recent.length >= rule.max) {
        hits.set(key, recent);
        const oldest = recent[0] ?? at;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - at) / 1000)),
        };
      }

      recent.push(at);
      hits.set(key, recent);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
};

/**
 * Who is calling, as far as this service can tell.
 *
 * Counted from the RIGHT, not the left. `x-forwarded-for` is a list the client
 * is free to start: Google's front end appends the address it actually saw and
 * then its own, so the head of the list is untrusted and the tail is not.
 *
 * Keying on the first entry is the obvious reading, and it is what this did
 * first. It is also useless: an abuser sets the header themselves and lands in
 * a fresh bucket on every request. That was measured against the deployed
 * service rather than reasoned about — twenty calls carrying one invented
 * address hit the limit, and a twenty-first carrying a different invented
 * address went straight through.
 *
 * So the second from last, which is the client as Google saw it. A caller who
 * supplies nothing still produces those two entries. Anything shorter means
 * this is not running behind the front end it expects, and sharing one bucket
 * is the safe way to be wrong.
 */
export const callerKey = (request: Request): string => {
  const hops = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop !== '');

  const client = hops.length >= 2 ? hops[hops.length - 2] : undefined;
  return client !== undefined && client !== '' ? client : 'unknown';
};
