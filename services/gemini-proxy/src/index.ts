import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type ProxyEnv, handleGeminiProxy } from './geminiProxy.js';

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
    // Cloud Run probes GET / to decide the container is live. Answering here
    // keeps that out of the handler, which would reject it as an unauthorized
    // request and make a healthy service look broken.
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(Buffer.from('ok'));
      return;
    }

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);

      const request = new Request(`https://proxy.invalid${req.url ?? '/'}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
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

const env: ProxyEnv = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  proxyToken: process.env.PROXY_TOKEN ?? '',
};

const port = Number(process.env.PORT ?? 8080);

createServer(toNodeHandler((request) => handleGeminiProxy(request, env))).listen(port);
