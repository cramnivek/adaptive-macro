import { describe, expect, it } from 'vitest';
import { toNodeHandler } from '../adapter';

/**
 * A minimal stand-in for node:http's ServerResponse, recording what was written.
 *
 * It carries `on` and `writableFinished` because a real one does, and the
 * adapter listens for the client hanging up. A fake missing them does not make
 * the adapter wrong — it makes the fake a worse model of the thing it stands in
 * for, and the difference is a 500.
 */
const fakeRes = () => {
  const chunks: Buffer[] = [];
  const listeners: Record<string, Array<() => void>> = {};
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    writableFinished: false,
    body: () => Buffer.concat(chunks).toString(),
    on(event: string, listener: () => void) {
      (listeners[event] ??= []).push(listener);
      return this;
    },
    /** What node does when the socket goes away. */
    emitClose() {
      for (const listener of listeners.close ?? []) listener();
    },
    writeHead(status: number, headers: Record<string, string>) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk?: Buffer) {
      if (chunk) chunks.push(chunk);
      this.writableFinished = true;
    },
  };
};

// A stand-in for IncomingMessage: an async-iterable carrying the body.
const fakeReq = (method: string, url: string, headers: Record<string, string>, body?: string) => ({
  method,
  url,
  headers,
  async *[Symbol.asyncIterator]() {
    if (body) yield Buffer.from(body);
  },
});

describe('toNodeHandler', () => {
  it('passes method, path, headers and body through to the handler', async () => {
    let seen: Request | undefined;
    const handler = toNodeHandler(async (request) => {
      seen = request;
      return new Response('ok', { status: 200 });
    });

    const res = fakeRes();
    await handler(
      fakeReq('POST', '/api/gemini', { 'x-proxy-token': 'tok', 'content-type': 'application/json' }, '{"a":1}') as any,
      res as any,
    );

    expect(seen?.method).toBe('POST');
    expect(new URL(seen!.url).pathname).toBe('/api/gemini');
    expect(seen?.headers.get('x-proxy-token')).toBe('tok');
    expect(await seen?.text()).toBe('{"a":1}');
  });

  it('writes the handler status and body back to the response', async () => {
    const handler = toNodeHandler(async () =>
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = fakeRes();
    await handler(fakeReq('POST', '/api/gemini', {}) as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body())).toEqual({ error: 'Unauthorized' });
  });

  // The health branch moved to the router, where it can answer /_health
  // independently of the web build. `/` is now the homepage and must reach
  // the handler like any other path.
  it('passes GET / through to the handler now that it is the homepage', async () => {
    let called = false;
    const handler = toNodeHandler(async () => {
      called = true;
      return new Response('<!DOCTYPE html>', { status: 201 });
    });

    const res = fakeRes();
    await handler(fakeReq('GET', '/', {}) as any, res as any);

    expect(called).toBe(true);
    expect(res.statusCode).toBe(201);
  });

  // A handler that throws must not hang the connection or leak a stack trace.
  it('turns an unexpected handler error into a 500 without leaking detail', async () => {
    const handler = toNodeHandler(async () => {
      throw new Error('boom: secret-key-abc');
    });

    const res = fakeRes();
    await handler(fakeReq('POST', '/api/gemini', {}) as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.body()).not.toContain('secret-key-abc');
  });
});

describe('toNodeHandler and a client that hangs up', () => {
  it('aborts the request signal when the response closes unfinished', async () => {
    let aborted = false;
    let release: (() => void) | undefined;
    const handler = toNodeHandler(async (request) => {
      request.signal.addEventListener('abort', () => {
        aborted = true;
      });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return new Response('ok', { status: 200 });
    });

    const res = fakeRes();
    const running = handler(fakeReq('POST', '/api/gemini', {}, '{}') as never, res as never);
    // Let the handler reach its await before the client goes away.
    await new Promise((resolve) => setTimeout(resolve, 0));

    res.emitClose();
    expect(aborted).toBe(true);

    release?.();
    await running;
  });

  it('does not abort when the response closes after it finished', async () => {
    let aborted = false;
    const handler = toNodeHandler(async (request) => {
      request.signal.addEventListener('abort', () => {
        aborted = true;
      });
      return new Response('ok', { status: 200 });
    });

    const res = fakeRes();
    await handler(fakeReq('GET', '/', {}) as never, res as never);

    // Node emits close on every response, served or abandoned. Only the
    // abandoned one may cancel: aborting a finished request would cancel
    // nothing and log noise.
    res.emitClose();
    expect(aborted).toBe(false);
  });
});
