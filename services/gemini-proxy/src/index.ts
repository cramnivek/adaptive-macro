import { createServer } from 'node:http';
import { join } from 'node:path';
import { toNodeHandler } from './adapter.js';
import type { ProxyEnv } from './geminiProxy.js';
import { createRouter } from './router.js';

const env: ProxyEnv = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  proxyToken: process.env.PROXY_TOKEN ?? '',
};

// The exported web build, copied in beside the compiled service at deploy
// time. Not `dist/`, which .gcloudignore excludes.
const webRoot = process.env.WEB_ROOT ?? join(process.cwd(), 'web');

const port = Number(process.env.PORT ?? 8080);

createServer(toNodeHandler(createRouter({ env, webRoot }))).listen(port);
