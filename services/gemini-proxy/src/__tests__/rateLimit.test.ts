import { describe, expect, it } from 'vitest';
import { callerKey, createRateLimiter } from '../rateLimit.js';

/** A clock the test moves by hand, so nothing here waits on real time. */
const clock = (start = 0) => {
  let at = start;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
};

describe('createRateLimiter', () => {
  it('allows calls up to the limit', () => {
    const time = clock();
    const limiter = createRateLimiter({ windowMs: 1000, max: 3 }, time.now);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('refuses the one past the limit', () => {
    const time = clock();
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 }, time.now);
    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('counts each caller separately', () => {
    const time = clock();
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 }, time.now);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('lets the window slide rather than resetting on a boundary', () => {
    const time = clock();
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 }, time.now);
    limiter.check('a');
    time.advance(600);
    limiter.check('a');
    time.advance(100);
    // Both hits are still inside the window.
    expect(limiter.check('a').allowed).toBe(false);

    // Only once the first one falls out does another get through, and the
    // second hit still counts — which is what a fixed bucket would get wrong.
    time.advance(400);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('reports how long until the caller may retry', () => {
    const time = clock();
    const limiter = createRateLimiter({ windowMs: 10_000, max: 1 }, time.now);
    limiter.check('a');
    time.advance(4_000);
    expect(limiter.check('a').retryAfterSeconds).toBe(6);
  });

  it('never reports a retry of zero seconds, which reads as "try now"', () => {
    const time = clock();
    const limiter = createRateLimiter({ windowMs: 100, max: 1 }, time.now);
    limiter.check('a');
    time.advance(99);
    expect(limiter.check('a').retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('forgets a caller once their whole window has passed', () => {
    const time = clock();
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 }, time.now);
    limiter.check('a');
    time.advance(1001);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('a refused call does not extend the block', () => {
    const time = clock();
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 }, time.now);
    limiter.check('a');
    time.advance(500);
    expect(limiter.check('a').allowed).toBe(false);
    time.advance(501);
    // The refusal at 500ms must not have been recorded as a hit.
    expect(limiter.check('a').allowed).toBe(true);
  });
});

describe('callerKey', () => {
  const withHeaders = (headers: Record<string, string>) =>
    new Request('https://example.test/api/gemini', { headers });

  /**
   * Google's front end appends the address it saw and then its own, so a
   * request that arrived with nothing still carries these two.
   */
  it('takes the client as the proxy saw it, not as the caller claimed', () => {
    expect(callerKey(withHeaders({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe(
      '203.0.113.9',
    );
  });

  it('ignores anything the caller prepended, which is the whole point', () => {
    // An abuser invents a head to land in a fresh bucket. It must change
    // nothing: both of these are the same caller.
    const one = callerKey(
      withHeaders({ 'x-forwarded-for': '198.51.100.77, 203.0.113.9, 10.0.0.1' }),
    );
    const two = callerKey(
      withHeaders({ 'x-forwarded-for': '203.0.113.55, 203.0.113.9, 10.0.0.1' }),
    );
    expect(one).toBe('203.0.113.9');
    expect(one).toBe(two);
  });

  it('is not fooled by a long invented chain either', () => {
    expect(
      callerKey({
        headers: new Headers({ 'x-forwarded-for': 'a, b, c, d, 203.0.113.9, 10.0.0.1' }),
      } as Request),
    ).toBe('203.0.113.9');
  });

  it('trims whitespace around the addresses', () => {
    expect(callerKey(withHeaders({ 'x-forwarded-for': '  203.0.113.9 ,  10.0.0.1 ' }))).toBe(
      '203.0.113.9',
    );
  });

  it('buckets together rather than exempting when the header is missing', () => {
    expect(callerKey(withHeaders({}))).toBe('unknown');
    expect(callerKey(withHeaders({ 'x-forwarded-for': '' }))).toBe('unknown');
    expect(callerKey(withHeaders({ 'x-forwarded-for': '  ' }))).toBe('unknown');
  });

  it('buckets together when there is only one hop, which is not the shape it expects', () => {
    // Not behind the front end: safer to share one allowance than to trust a
    // value the caller fully controls.
    expect(callerKey(withHeaders({ 'x-forwarded-for': '198.51.100.77' }))).toBe('unknown');
  });
});
