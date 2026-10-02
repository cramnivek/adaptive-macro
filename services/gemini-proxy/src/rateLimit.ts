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
 * Cloud Run puts the caller at the head of `x-forwarded-for` and appends its
 * own hops, so only the first entry is the client. Everything unidentifiable
 * shares one bucket, which is the conservative way round: a caller that hides
 * its address gets the strictest treatment rather than an exemption.
 */
export const callerKey = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first !== undefined && first !== '' ? first : 'unknown';
};
