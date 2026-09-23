import { describe, expect, it } from 'vitest';
import { toNodeHandler } from '../adapter';

// A minimal stand-in for node:http's ServerResponse, recording what was written.
const fakeRes = () => {
  const chunks: Buffer[] = [];
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: () => Buffer.concat(chunks).toString(),
    writeHead(status: number, headers: Record<string, string>) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk?: Buffer) {
      if (chunk) chunks.push(chunk);
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

  // Cloud Run sends an unsolicited GET / health probe. Letting that reach the
  // handler would answer 401 and could be read as the service being broken.
  it('answers a health probe on GET / without invoking the handler', async () => {
    let called = false;
    const handler = toNodeHandler(async () => {
      called = true;
      return new Response('nope', { status: 500 });
    });

    const res = fakeRes();
    await handler(fakeReq('GET', '/', {}) as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(called).toBe(false);
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
