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

  it('takes the client from the head of x-forwarded-for, not the proxy hops', () => {
    expect(callerKey(withHeaders({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' }))).toBe(
      '203.0.113.9',
    );
  });

  it('trims whitespace around the address', () => {
    expect(callerKey(withHeaders({ 'x-forwarded-for': '  203.0.113.9 , 10.0.0.1' }))).toBe(
      '203.0.113.9',
    );
  });

  it('buckets an unidentifiable caller rather than exempting it', () => {
    expect(callerKey(withHeaders({}))).toBe('unknown');
    expect(callerKey(withHeaders({ 'x-forwarded-for': '' }))).toBe('unknown');
    expect(callerKey(withHeaders({ 'x-forwarded-for': '  ' }))).toBe('unknown');
  });
});
