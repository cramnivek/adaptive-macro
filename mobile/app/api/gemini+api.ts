import { handleGeminiProxy } from '../../src/server/geminiProxy';

export const POST = (request: Request) =>
  handleGeminiProxy(request, {
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    proxyToken: process.env.EXPO_PUBLIC_PROXY_TOKEN ?? '',
  });
