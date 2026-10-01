import { type IncomingMessage, type ServerResponse } from 'node:http';

/**
 * Adapts a Web-standard handler onto node:http.
 *
 * The handler is written against `Request`/`Response` because that is what it
 * was first deployed on, and keeping that shape means the proxy is portable to
 * any runtime — which is not hypothetical: it already moved hosts once.
 */
export const toNodeHandler =
  (handler: (request: Request) => Promise<Response>) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);

      // A client that hangs up should take the upstream call with it. Without
      // this the handler runs to completion against Gemini and is billed for an
      // answer with nobody left to receive it — a grounded lookup the user
      // typed past is ninety seconds of exactly that.
      const aborter = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) aborter.abort();
      });

      const request = new Request(`https://proxy.invalid${req.url ?? '/'}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        signal: aborter.signal,
      });

      const response = await handler(request);
      const body = Buffer.from(await response.arrayBuffer());

      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(body);
    } catch {
      // Deliberately opaque. An exception here can carry a key in its message,
      // and the caller can do nothing with the detail either way.
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(Buffer.from(JSON.stringify({ error: 'Proxy failed' })));
    }
  };
