import { afterEach, describe, expect, it, vi } from 'vitest';
import { messageFor } from '../errors';
import { withTimeout } from '../timeoutFetch';

/** A fetch that never answers on its own, and rejects the way fetch does when its signal aborts. */
const hanging = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  }),
);

afterEach(() => {
  vi.useRealTimers();
  hanging.mockClear();
});

describe('withTimeout', () => {
  it('gives up on a request that takes too long', async () => {
    vi.useFakeTimers();
    const request = withTimeout(hanging, 20_000)('https://example.test');
    const settled = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(20_000);
    await settled;
  });

  it('leaves a quick request alone', async () => {
    const ok = vi.fn(async () => new Response('fine'));
    const response = await withTimeout(ok, 20_000)('https://example.test');
    expect(await response.text()).toBe('fine');
  });

  it('respects a signal the caller already passed, rather than adding its own', async () => {
    const caller = new AbortController();
    const request = withTimeout(hanging, 20_000)('https://example.test', { signal: caller.signal });
    expect(hanging.mock.calls[0][1]?.signal).toBe(caller.signal);
    caller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('messageFor on a timed-out request', () => {
  it('says the server took too long, not that something went wrong', () => {
    // postgrest-js reports a failed fetch as `${name}: ${message}`.
    expect(messageFor({ message: 'AbortError: The operation was aborted.' })).toBe(
      'The server took too long to answer. Try again.',
    );
  });
});
