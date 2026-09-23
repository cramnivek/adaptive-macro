import { createServer } from 'node:http';
import { toNodeHandler } from './adapter.js';
import { type ProxyEnv, handleGeminiProxy } from './geminiProxy.js';

const env: ProxyEnv = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  proxyToken: process.env.PROXY_TOKEN ?? '',
};

const port = Number(process.env.PORT ?? 8080);

createServer(toNodeHandler((request) => handleGeminiProxy(request, env))).listen(port);
