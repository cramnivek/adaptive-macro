# Hosted Gemini Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fresh install looks up food and describes meals with no API key, by routing Gemini calls through a hosted proxy that holds the key server-side.

**Architecture:** One small Node service on Google Cloud Run acts as a thin passthrough — it checks a shared token, checks the model against an allowlist, attaches the Gemini key from the server environment, and forwards the body unchanged. The client picks its route at call time: a key in Settings goes direct to Google, no key goes through the proxy. All existing response validation stays client-side where its tests are.

**Tech Stack:** Expo SDK 57, Node 20+ on Google Cloud Run, vitest 2, TypeScript 6, zod 3 (via `zod/v4`).

> **Task 1 was implemented against EAS Hosting and that host does not work.** It was deployed and measured: Google returns `400 FAILED_PRECONDITION: User location is not supported for the API use` for every call from it, grounded and ungrounded, 3 of 3, while identical calls from a dev machine return 200. The worker egress reported `loc=PH` — the same country as the working machine — so it is the Cloudflare anycast IP being refused, not a region. Task 1's handler is unaffected and keeps its tests; Task 2 moves it to Cloud Run and removes the EAS route.

## Global Constraints

- From Task 2 on, proxy logic lives in `services/gemini-proxy/src/`. It must stay a pure `(Request, ProxyEnv) => Promise<Response>` with the HTTP adapter kept separate — this code has already changed hosts once, and that portability is what made the move cheap.
- The Gemini key is a server-side environment variable on Cloud Run. It is never prefixed `EXPO_PUBLIC_` (that prefix inlines a value into the client bundle), never written to a file in the repo, and never printed by a command in this plan.
- The app sends the shared token as `EXPO_PUBLIC_PROXY_TOKEN`; the service reads it as `PROXY_TOKEN`. Same value, two names — the prefix is meaningful only on the client.
- `MODEL` stays `gemini-3.5-flash`. `GROUNDED_TIMEOUT_MS` stays `90_000` and `STRUCTURE_TIMEOUT_MS` stays `15_000`.
- A key present in Settings always wins over the proxy. This is the fallback path and must never be removed.
- Run a single workspace's tests with `npm run test --workspace @adaptive-macros/<name>`. Root `npm test` covers engine and mobile from Task 1, and the proxy service from Task 2.
- `expo export` does not clean `dist/`, so a deleted route redeploys from stale output. `rm -rf dist` before any export whose purpose is to remove something.
- Commit after every task. Do not push until the whole plan is green.

---

### Task 1: Proxy handler

**Files:**
- Create: `mobile/src/server/geminiProxy.ts`
- Create: `mobile/src/server/__tests__/geminiProxy.test.ts`
- Create: `mobile/app/api/gemini+api.ts`
- Modify: `mobile/app.json` (add `web.output`)
- Modify: `package.json` (root, `scripts.test`)

**Interfaces:**
- Consumes: nothing.
- Produces: `handleGeminiProxy(request: Request, env: ProxyEnv): Promise<Response>` and `interface ProxyEnv { geminiApiKey: string; proxyToken: string }`, plus the exported constant `ALLOWED_MODELS: readonly string[]`.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/server/__tests__/geminiProxy.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALLOWED_MODELS, handleGeminiProxy } from '../geminiProxy';

const env = { geminiApiKey: 'server-side-key', proxyToken: 'shared-token' };

const request = (headers: Record<string, string>, body: unknown = { contents: [] }) =>
  new Request('https://example.test/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const validHeaders = {
  'x-proxy-token': 'shared-token',
  'x-gemini-model': ALLOWED_MODELS[0],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleGeminiProxy', () => {
  it('rejects a missing token without calling Google', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleGeminiProxy(request({ 'x-gemini-model': ALLOWED_MODELS[0] }), env);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong token without calling Google', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleGeminiProxy(
      request({ ...validHeaders, 'x-proxy-token': 'guessed' }),
      env,
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a model outside the allowlist', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleGeminiProxy(
      request({ ...validHeaders, 'x-gemini-model': 'gemini-3.0-ultra-expensive' }),
      env,
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // An unset variable must fail closed. With a blank expected token, a request
  // that simply omits the header would otherwise compare '' to '' and pass,
  // turning a misconfigured deploy into an open relay on a billing key.
  it('fails closed when the server is misconfigured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleGeminiProxy(request({ 'x-gemini-model': ALLOWED_MODELS[0] }), {
      geminiApiKey: '',
      proxyToken: '',
    });

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the body verbatim with the server key attached', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const body = { contents: [{ parts: [{ text: 'chickenjoy' }] }], tools: [{ google_search: {} }] };
    const response = await handleGeminiProxy(request(validHeaders, body), env);

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`${ALLOWED_MODELS[0]}:generateContent`);
    expect(url).toContain('key=server-side-key');
    expect(JSON.parse(init.body)).toEqual(body);
  });

  // The client maps 429 to "quota reached" and 400/403 to a key problem. If the
  // proxy flattened upstream failures to 500, every one of those messages would
  // become wrong on the proxy path.
  it('passes an upstream failure status through unchanged', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":{}}', { status: 429 }));

    const response = await handleGeminiProxy(request(validHeaders), env);

    expect(response.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @adaptive-macros/mobile -- geminiProxy`
Expected: FAIL — `Failed to resolve import "../geminiProxy"`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/src/server/geminiProxy.ts`:

```ts
/**
 * Server-side Gemini passthrough.
 *
 * The app sends the request body it would otherwise have sent to Google; this
 * attaches the key and forwards it. Deliberately dumb: the grounding gate, the
 * `found` check and the zero-macro floor all stay in `src/api/gemini.ts`, where
 * they are tested. Duplicating them here would leave those tests pointing at a
 * copy that no longer runs.
 *
 * Lives under `src/` rather than in the route file because vitest only collects
 * `src/**‍/__tests__/**`, and an untested open relay on a billing key is not
 * something to ship.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * A passthrough is otherwise a free LLM for anyone holding the token. The
 * allowlist is what stops that costing more per call than the app ever would.
 */
export const ALLOWED_MODELS = ['gemini-3.5-flash'] as const;

export interface ProxyEnv {
  geminiApiKey: string;
  proxyToken: string;
}

export const handleGeminiProxy = async (
  request: Request,
  env: ProxyEnv,
): Promise<Response> => {
  // Fail closed. A blank expected token would otherwise match a request that
  // omits the header, so a misconfigured deploy would silently open the relay.
  if (!env.proxyToken || !env.geminiApiKey) {
    return Response.json({ error: 'Proxy is not configured' }, { status: 500 });
  }

  if (request.headers.get('x-proxy-token') !== env.proxyToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const model = request.headers.get('x-gemini-model') ?? '';
  if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
    return Response.json({ error: 'Model not allowed' }, { status: 400 });
  }

  const body = await request.text();
  const upstream = await fetch(
    `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
  );

  // Status passes through untouched so the client's existing error mapping —
  // 429 to quota, 400/403 to a key problem — keeps describing what happened.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @adaptive-macros/mobile -- geminiProxy`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the route wrapper**

Create `mobile/app/api/gemini+api.ts`:

```ts
import { handleGeminiProxy } from '../../src/server/geminiProxy';

export const POST = (request: Request) =>
  handleGeminiProxy(request, {
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    proxyToken: process.env.EXPO_PUBLIC_PROXY_TOKEN ?? '',
  });
```

- [ ] **Step 6: Enable API routes**

In `mobile/app.json`, replace the `web` block:

```json
    "web": {
      "favicon": "./assets/favicon.png",
      "bundler": "metro",
      "output": "server"
    },
```

API routes require `web.output: "server"`. Note this changes the web build from static to server-rendered, which is what makes `/api/gemini` exist.

- [ ] **Step 7: Make root `npm test` run mobile tests**

Mobile already has tests that root `npm test` never ran — a pre-existing gap, not one this plan creates, but this plan adds tests that would inherit it.

In the root `package.json`, replace the `test` script:

```json
    "test": "npm run test --workspace @adaptive-macros/engine && npm run test --workspace @adaptive-macros/mobile",
```

- [ ] **Step 8: Verify the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. Engine tests, then mobile tests including the 6 new ones.

- [ ] **Step 9: Commit**

```bash
git add mobile/src/server mobile/app/api mobile/app.json package.json
git commit -m "feat(api): add a server-side Gemini passthrough

Holds the key server-side so a fresh install needs no configuration. The
route is a wrapper; the logic sits in src/ where vitest can reach it, and
fails closed when either environment variable is unset so a misconfigured
deploy cannot open a relay on a billing key.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

### Task 2: Port the handler to a Cloud Run service

**Files:**
- Create: `services/gemini-proxy/package.json`
- Create: `services/gemini-proxy/tsconfig.json`
- Create: `services/gemini-proxy/src/geminiProxy.ts` (moved from `mobile/src/server/geminiProxy.ts`)
- Create: `services/gemini-proxy/src/index.ts`
- Create: `services/gemini-proxy/src/__tests__/geminiProxy.test.ts` (moved from `mobile/src/server/__tests__/geminiProxy.test.ts`)
- Create: `services/gemini-proxy/src/__tests__/index.test.ts`
- Create: `services/gemini-proxy/vitest.config.ts`
- Create: `services/gemini-proxy/.gcloudignore`
- Delete: `mobile/app/api/gemini+api.ts`
- Delete: `mobile/src/server/` (both files, moved above)
- Modify: `mobile/app.json` (remove `web.output`)
- Modify: `package.json` (root — workspaces and test script)

**Interfaces:**
- Consumes: `handleGeminiProxy(request, env)` and `ProxyEnv` from Task 1, moved unchanged.
- Produces: a deployable service. `toNodeHandler` is internal to `index.ts`.

**Why this task exists.** Task 1 put the handler on EAS Hosting. That was deployed and measured, and Google rejects every call from it with `400 FAILED_PRECONDITION: User location is not supported for the API use` — 3 of 3 attempts, grounded and ungrounded alike, while the same calls from a dev machine return 200. The worker's egress reported `loc=PH`, the same country as the working machine, so it is not a region problem: Google refuses the Cloudflare anycast IP itself. No EAS region fixes that. The handler is sound and its six tests still pass; only its host changes.

- [ ] **Step 1: Create the service workspace**

Create `services/gemini-proxy/package.json`:

```json
{
  "name": "@adaptive-macros/gemini-proxy",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "devDependencies": {
    "typescript": "~6.0.3",
    "vitest": "^2.1.8"
  }
}
```

`build` and `start` are the two scripts Google Cloud buildpacks look for on a `--source` deploy, so no Dockerfile is needed.

Create `services/gemini-proxy/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023", "DOM"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/__tests__/**"]
}
```

Create `services/gemini-proxy/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

Create `services/gemini-proxy/.gcloudignore`:

```
node_modules/
dist/
src/**/__tests__/
```

- [ ] **Step 2: Move the handler and its tests, unchanged**

```bash
cd /c/Users/marca/adaptive-macro
mkdir -p services/gemini-proxy/src/__tests__
git mv mobile/src/server/geminiProxy.ts services/gemini-proxy/src/geminiProxy.ts
git mv mobile/src/server/__tests__/geminiProxy.test.ts services/gemini-proxy/src/__tests__/geminiProxy.test.ts
```

Change nothing inside either file except one thing: the doc comment in `geminiProxy.ts` currently explains that it lives under `src/` because mobile's vitest only collects `src/**/__tests__/**`. That reason no longer applies. Replace that final paragraph with:

```
 * Lives in its own service rather than in the app because Google refuses
 * requests from EAS Hosting's Cloudflare egress — `FAILED_PRECONDITION: User
 * location is not supported`, on every call, from an IP whose reported country
 * is the same one that works directly. Cloud Run gives an attributable egress
 * on Google's own network instead.
```

The import in the test file (`from '../geminiProxy'`) is still correct after the move.

- [ ] **Step 3: Write the failing adapter test**

Create `services/gemini-proxy/src/__tests__/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toNodeHandler } from '../index';

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
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd /c/Users/marca/adaptive-macro && npm run test --workspace @adaptive-macros/gemini-proxy`
Expected: FAIL — `Failed to resolve import "../index"`.

- [ ] **Step 5: Write the adapter and entrypoint**

Create `services/gemini-proxy/src/index.ts`:

```ts
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
```

Note the variable is `PROXY_TOKEN` here, not `EXPO_PUBLIC_PROXY_TOKEN`. The `EXPO_PUBLIC_` prefix exists to inline a value into the client bundle; on the server it is meaningless and would only suggest this service ships something to a client. The app keeps sending `EXPO_PUBLIC_PROXY_TOKEN`; both must hold the same value.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd /c/Users/marca/adaptive-macro && npm install && npm run test --workspace @adaptive-macros/gemini-proxy`
Expected: PASS, 10 tests (6 moved + 4 new).

- [ ] **Step 7: Remove the EAS Hosting route**

```bash
cd /c/Users/marca/adaptive-macro
git rm mobile/app/api/gemini+api.ts
rmdir mobile/app/api mobile/src/server/__tests__ mobile/src/server 2>/dev/null || true
```

In `mobile/app.json`, remove the `"output": "server"` line so the `web` block returns to:

```json
    "web": {
      "favicon": "./assets/favicon.png",
      "bundler": "metro"
    },
```

That line existed only to enable API routes. Leaving it would keep building a server bundle for a route that no longer exists.

- [ ] **Step 8: Register the workspace and the tests**

In the root `package.json`, add the services glob to `workspaces`:

```json
  "workspaces": [
    "packages/*",
    "services/*",
    "mobile"
  ],
```

And extend `test` so the moved tests still run:

```json
    "test": "npm run test --workspace @adaptive-macros/engine && npm run test --workspace @adaptive-macros/mobile && npm run test --workspace @adaptive-macros/gemini-proxy",
```

- [ ] **Step 9: Verify the whole suite**

Run: `cd /c/Users/marca/adaptive-macro && npm install && npm test && npm run typecheck && npm run typecheck --workspace @adaptive-macros/gemini-proxy`
Expected: all PASS. Mobile's suite is now 19 tests (the 6 proxy tests moved out).

- [ ] **Step 10: Verify the service against the real Gemini API, locally**

This is the step that proves the port. Run it from the dev machine, whose IP Google accepts — that is exactly what makes this a valid check.

`mobile/.env.local` already holds both values. Start the service with them:

```bash
cd /c/Users/marca/adaptive-macro/services/gemini-proxy
npm run build
GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' ../../mobile/.env.local | cut -d= -f2- | tr -d '\r"') \
PROXY_TOKEN=$(grep '^EXPO_PUBLIC_PROXY_TOKEN=' ../../mobile/.env.local | cut -d= -f2- | tr -d '\r"') \
PORT=8080 npm start &
```

Then, substituting the same token, confirm all four behaviours. **Never echo either value.**

```bash
TOKEN=$(grep '^EXPO_PUBLIC_PROXY_TOKEN=' /c/Users/marca/adaptive-macro/mobile/.env.local | cut -d= -f2- | tr -d '\r"')
curl -s -o /dev/null -w "health: %{http_code}\n" http://localhost:8080/
curl -s -o /dev/null -w "no token: %{http_code}\n" -X POST http://localhost:8080/api/gemini \
  -H "Content-Type: application/json" -H "x-gemini-model: gemini-3.5-flash" -d '{"contents":[]}'
curl -s -o /dev/null -w "bad model: %{http_code}\n" -X POST http://localhost:8080/api/gemini \
  -H "Content-Type: application/json" -H "x-proxy-token: $TOKEN" -H "x-gemini-model: nope" -d '{"contents":[]}'
curl -s -m 60 -X POST http://localhost:8080/api/gemini \
  -H "Content-Type: application/json" -H "x-proxy-token: $TOKEN" \
  -H "x-gemini-model: gemini-3.5-flash" -d '{"contents":[{"parts":[{"text":"Say OK"}]}]}' \
  | head -c 200
```

Expected: `health: 200`, `no token: 401`, `bad model: 400`, and a real Gemini response on the last one — **not** `FAILED_PRECONDITION`. Stop the background service afterwards.

If the last call returns `FAILED_PRECONDITION` from the dev machine, stop and report: that would mean the key itself is geo-restricted rather than the host, and the whole Cloud Run plan needs rethinking before any deploy.

- [ ] **Step 11: Commit**

```bash
git add -A services mobile package.json
git commit -m "refactor(proxy): move the Gemini proxy to a Cloud Run service

EAS Hosting cannot reach the Gemini API. Every call from the deployed
worker returned 400 FAILED_PRECONDITION 'User location is not supported',
grounded and ungrounded alike, 3 of 3, while the same calls from a dev
machine returned 200. The worker egress reported loc=PH -- the same
country as the working machine -- so this is not a region problem:
Google refuses the Cloudflare anycast IP itself, and no EAS region
changes that.

The handler is unchanged. It was already a pure Request -> Response, so
the port is an HTTP adapter plus a health-probe branch for Cloud Run.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

### Task 2D: Deploy to Cloud Run

**Files:** none. The deliverable is a verified URL, used as `PROXY_BASE` in Task 3.

This task is manual and needs an interactive Google login, so it is the controller's to run with the human partner, not a subagent's.

- [ ] **Step 1: Install the CLI and authenticate**

`gcloud` is not installed on this machine. Install it, then the human partner runs the login themselves — it opens a browser and must not be automated:

```
gcloud auth login
gcloud config set project <the Food Tracker project id>
```

- [ ] **Step 2: Deploy**

```bash
cd /c/Users/marca/adaptive-macro/services/gemini-proxy
gcloud run deploy gemini-proxy --source . --region asia-southeast1 \
  --allow-unauthenticated --timeout 120 \
  --set-env-vars "GEMINI_API_KEY=...,PROXY_TOKEN=..."
```

`--allow-unauthenticated` is correct here: the app is anonymous and the shared token is the gate. `--timeout 120` clears the 90s grounded call with margin. Prefer `--set-secrets` over `--set-env-vars` if Secret Manager is already set up on the project.

- [ ] **Step 3: Verify the deployment**

Repeat Step 10's four checks against the deployed URL, then run one real **grounded** call and time it:

```bash
time curl -s -m 150 -o /tmp/grounded.json -w "%{http_code}\n" -X POST <URL>/api/gemini \
  -H "Content-Type: application/json" -H "x-proxy-token: <token>" \
  -H "x-gemini-model: gemini-3.5-flash" \
  -d '{"contents":[{"parts":[{"text":"Find published nutrition information for a KFC UK Original Recipe Rib"}]}],"tools":[{"google_search":{}}]}'
```

Expected: `200`, `groundingChunks` present, and a wall-clock time under 90s. This finally answers the question the EAS deployment never reached.

If it returns `FAILED_PRECONDITION`, Cloud Run's egress is refused too and the fallback is Vertex AI — stop and report rather than trying other hosts.

- [ ] **Step 4: Record the URL**

Record the service URL. That is `PROXY_BASE` for Task 3, Step 5.

### Task 3: Client routing — direct or proxy

**Files:**
- Modify: `mobile/src/api/gemini.ts`
- Modify: `mobile/src/api/__tests__/gemini.test.ts`

**Interfaces:**
- Consumes: the deployed base URL from Task 2.
- Produces: `routeFor(model: string, apiKey: string): GeminiRoute` where `interface GeminiRoute { url: string; headers: Record<string, string>; viaProxy: boolean }`. `lookupFood(query, country, apiKey)` keeps its signature but now accepts an empty `apiKey`.

- [ ] **Step 1: Write the failing test**

Append to `mobile/src/api/__tests__/gemini.test.ts`:

```ts
import { routeFor } from '../gemini';

describe('routeFor', () => {
  it('goes direct to Google when a key is set, carrying the key in the query', () => {
    const route = routeFor('gemini-3.5-flash', 'AIzaUserKey');

    expect(route.viaProxy).toBe(false);
    expect(route.url).toContain('generativelanguage.googleapis.com');
    expect(route.url).toContain('key=AIzaUserKey');
    expect(route.headers['x-proxy-token']).toBeUndefined();
  });

  it('goes through the proxy when no key is set, naming the model in a header', () => {
    const route = routeFor('gemini-3.5-flash', '');

    expect(route.viaProxy).toBe(true);
    expect(route.url).toContain('/api/gemini');
    expect(route.url).not.toContain('generativelanguage.googleapis.com');
    expect(route.headers['x-gemini-model']).toBe('gemini-3.5-flash');
  });

  it('treats a whitespace-only key as absent', () => {
    expect(routeFor('gemini-3.5-flash', '   ').viaProxy).toBe(true);
  });

  // The key never leaves the device on the proxy path. If it did, the whole
  // reason for the proxy would be inverted.
  it('never sends a user key to the proxy', () => {
    const route = routeFor('gemini-3.5-flash', '');

    expect(JSON.stringify(route)).not.toContain('AIza');
  });
});

describe('lookupFood without a key', () => {
  // Before the proxy, an empty key threw "Add a Gemini API key in Settings".
  // That instruction is now wrong, so the guard must be gone.
  it('does not reject an empty key out of hand', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    ));

    await expect(lookupFood('chickenjoy', 'ph', '')).rejects.toThrow(UngroundedResponseError);

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @adaptive-macros/mobile -- gemini.test`
Expected: FAIL — `routeFor` is not exported, and `lookupFood` rejects with `GroundedLookupError` rather than `UngroundedResponseError`.

- [ ] **Step 3: Write the implementation**

In `mobile/src/api/gemini.ts`, add below the existing `ENDPOINT` constant:

```ts
/**
 * Where the app talks to Gemini when the user has supplied no key of their own.
 *
 * Set per environment so the route can be exercised against a local dev server
 * without deploying.
 */
const PROXY_BASE = process.env.EXPO_PUBLIC_API_BASE ?? '<PROXY_BASE from Task 2>';
const PROXY_TOKEN = process.env.EXPO_PUBLIC_PROXY_TOKEN ?? '';

export interface GeminiRoute {
  url: string;
  headers: Record<string, string>;
  viaProxy: boolean;
}

/**
 * Chooses between the user's own key and the hosted proxy.
 *
 * A key in Settings always wins. That keeps bring-your-own-key users off the
 * shared quota, and makes a proxy outage degrade to "enter a key" rather than
 * to a broken feature.
 */
export const routeFor = (model: string, apiKey: string): GeminiRoute => {
  const key = apiKey.trim();

  if (key) {
    return {
      url: `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(key)}`,
      headers: { 'Content-Type': 'application/json' },
      viaProxy: false,
    };
  }

  return {
    url: `${PROXY_BASE}/api/gemini`,
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-token': PROXY_TOKEN,
      'x-gemini-model': model,
    },
    viaProxy: true,
  };
};
```

Replace the body of `postJson` with a version that routes and picks its messages by path:

```ts
const postJson = async (
  model: string,
  body: unknown,
  apiKey: string,
  timeoutMs: number,
): Promise<any> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const route = routeFor(model, apiKey);

  try {
    const response = await fetch(route.url, {
      method: 'POST',
      signal: controller.signal,
      headers: route.headers,
      body: JSON.stringify(body),
    });

    // Same status, different cause. On the direct path the user's own key was
    // rejected and they can fix it; on the proxy path the key is the author's
    // and "check it in Settings" would send them looking for a field that is
    // empty on purpose.
    if (response.status === 400 || response.status === 403) {
      throw new GroundedLookupError(
        route.viaProxy
          ? 'The lookup service is unavailable. Try again later, or add your own Gemini API key in Settings.'
          : 'That Gemini API key was rejected. Check it in Settings.',
      );
    }
    if (response.status === 401) {
      throw new GroundedLookupError(
        'This build cannot reach the lookup service. Add your own Gemini API key in Settings.',
      );
    }
    // Grounding is metered separately and needs billing enabled on the project;
    // without it every grounded call returns 429 while plain ones still succeed.
    if (response.status === 429) {
      throw new GroundedLookupError(
        route.viaProxy
          ? 'The shared lookup allowance is used up for now. Try again later, or add your own Gemini API key in Settings.'
          : 'Gemini quota reached. Web lookup needs billing enabled on your Google Cloud project.',
      );
    }
    if (!response.ok) {
      throw new GroundedLookupError(`Gemini returned ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new GroundedLookupError('Gemini returned a malformed response');
    }
  } catch (error) {
    if (error instanceof GroundedLookupError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new GroundedLookupError('The lookup took too long. Try again.');
    }
    throw new GroundedLookupError('Could not reach Gemini. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
};
```

Delete these three lines from the top of `lookupFood` — an empty key now means "use the proxy", not "fail":

```ts
  if (!apiKey.trim()) {
    throw new GroundedLookupError('Add a Gemini API key in Settings to look foods up.');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace @adaptive-macros/mobile -- gemini.test`
Expected: PASS. All pre-existing tests in this file still pass — none of them set an empty key.

- [ ] **Step 5: Fill in the real proxy base**

Replace `'<PROXY_BASE from Task 2>'` with the URL recorded in Task 2, Step 4. It is a public hostname, not a credential, so it belongs in the source as the default.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run typecheck`

```bash
git add mobile/src/api/gemini.ts mobile/src/api/__tests__/gemini.test.ts
git commit -m "feat(api): route Gemini through the proxy when no key is set

A key in Settings still wins and goes direct. Error messages now depend on
which path ran: 'check it in Settings' is wrong advice on the proxy path,
where the user has no key to check.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

### Task 4: Gemini meal description

**Files:**
- Create: `mobile/src/ai/geminiDescribe.ts`
- Create: `mobile/src/ai/__tests__/geminiDescribe.test.ts`
- Modify: `mobile/src/ai/describeMeal.ts` (the `estimateMeal` dispatcher and `describeErrorMessage`)

**Interfaces:**
- Consumes: `routeFor` from Task 3; `SYSTEM_PROMPT`, `MealEstimateSchema` and `DescribeResult` from `describeMeal.ts`.
- Produces: `describeMealWithGemini(description: string, apiKey: string): Promise<DescribeResult>`.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/ai/__tests__/geminiDescribe.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeMealWithGemini } from '../geminiDescribe';

const estimate = {
  items: [
    {
      name: 'Scrambled eggs',
      grams: 120,
      kcal: 220,
      proteinG: 14,
      carbsG: 2,
      fatG: 17,
      fiberG: 0,
      confidence: 'high',
      assumption: 'Two large eggs cooked in butter.',
    },
  ],
  notes: '',
  notFood: false,
};

const geminiResponse = (payload: unknown, usage = { promptTokenCount: 310, candidatesTokenCount: 95 }) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      usageMetadata: usage,
    }),
    { status: 200 },
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('describeMealWithGemini', () => {
  it('parses a well-formed estimate and reports token usage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse(estimate)));

    const result = await describeMealWithGemini('two scrambled eggs', '');

    expect(result.estimate.items[0].name).toBe('Scrambled eggs');
    expect(result.estimate.items[0].kcal).toBe(220);
    expect(result.usage).toEqual({ inputTokens: 310, outputTokens: 95 });
  });

  it('sends the shared system prompt so the eval compares providers, not prompts', async () => {
    const fetchMock = vi.fn(async () => geminiResponse(estimate));
    vi.stubGlobal('fetch', fetchMock);

    await describeMealWithGemini('two scrambled eggs', '');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toContain('Be accurate rather than cautious');
  });

  it('routes through the proxy when no key is given', async () => {
    const fetchMock = vi.fn(async () => geminiResponse(estimate));
    vi.stubGlobal('fetch', fetchMock);

    await describeMealWithGemini('two scrambled eggs', '');

    expect(fetchMock.mock.calls[0][0]).toContain('/api/gemini');
  });

  it('uses the key directly when one is given', async () => {
    const fetchMock = vi.fn(async () => geminiResponse(estimate));
    vi.stubGlobal('fetch', fetchMock);

    await describeMealWithGemini('two scrambled eggs', 'AIzaUserKey');

    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
  });

  // Gemini's responseSchema is a hint, not a guarantee. zod is what actually
  // decides whether a response reaches the diary, exactly as it does for Claude.
  it('rejects a response that satisfies no schema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => geminiResponse({ items: 'lots', notes: 5 })));

    await expect(describeMealWithGemini('two scrambled eggs', '')).rejects.toThrow();
  });

  it('rejects malformed JSON rather than returning half a meal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"items":' }] } }] }),
        { status: 200 },
      ),
    ));

    await expect(describeMealWithGemini('two scrambled eggs', '')).rejects.toThrow();
  });

  it('carries notFood through instead of inventing items', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      geminiResponse({ items: [], notes: 'That is a bicycle.', notFood: true }),
    ));

    const result = await describeMealWithGemini('my bicycle', '');

    expect(result.estimate.notFood).toBe(true);
    expect(result.estimate.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @adaptive-macros/mobile -- geminiDescribe`
Expected: FAIL — `Failed to resolve import "../geminiDescribe"`.

- [ ] **Step 3: Write the implementation**

Create `mobile/src/ai/geminiDescribe.ts`:

```ts
import { routeFor } from '../api/gemini';
import { type DescribeResult, MealEstimateSchema, SYSTEM_PROMPT } from './describeMeal';

/**
 * Meal estimation through Gemini.
 *
 * Exists because the local model cannot be a default: it needs the user's own
 * machine running Ollama on an address the phone can reach, which is true for
 * exactly one user. Accuracy is measured by the existing meal-estimation eval;
 * availability is why this is the default regardless of what it measures.
 *
 * The prompt is `SYSTEM_PROMPT` verbatim, shared with the Claude path, so the
 * eval compares providers rather than prompts.
 */

const MODEL = 'gemini-3.5-flash';

/** No web search here, so structured output is honoured and this can be quick. */
const TIMEOUT_MS = 30_000;

/**
 * Mirrors `MealEstimateSchema`, which zod still enforces on the parsed result.
 *
 * This is a hint that shapes what the model emits; it is not validation. A
 * response can satisfy Gemini and still be wrong for the app, so the zod parse
 * below is what actually decides whether anything reaches the diary.
 */
const MEAL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          proteinG: { type: 'number' },
          carbsG: { type: 'number' },
          fatG: { type: 'number' },
          fiberG: { type: 'number' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          assumption: { type: 'string' },
        },
        required: [
          'name', 'grams', 'kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG',
          'confidence', 'assumption',
        ],
      },
    },
    notes: { type: 'string' },
    notFood: { type: 'boolean' },
  },
  required: ['items', 'notes', 'notFood'],
} as const;

const textOf = (response: unknown): string => {
  const parts = (response as any)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
};

export const describeMealWithGemini = async (
  description: string,
  apiKey: string,
): Promise<DescribeResult> => {
  const route = routeFor(MODEL, apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let payload: any;
  try {
    const response = await fetch(route.url, {
      method: 'POST',
      signal: controller.signal,
      headers: route.headers,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: description.trim() }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: MEAL_RESPONSE_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`The estimate service returned ${response.status}.`);
    }
    payload = await response.json();
  } finally {
    clearTimeout(timer);
  }

  const text = textOf(payload);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini replied in a form this app could not read. Try rephrasing.');
  }

  // zod, not Gemini, is the boundary. Same rule as the Claude path: a response
  // that does not validate is rejected rather than half-read into the diary.
  const estimate = MealEstimateSchema.parse(parsed);

  const usage = payload?.usageMetadata ?? {};
  return {
    estimate,
    usage: {
      inputTokens: typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : 0,
      outputTokens: typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : 0,
    },
    model: MODEL,
    raw: { stopReason: null, text },
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace @adaptive-macros/mobile -- geminiDescribe`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire it into the dispatcher**

In `mobile/src/ai/describeMeal.ts`, replace `estimateMeal` entirely:

```ts
export const estimateMeal = async (
  description: string,
  config: {
    provider: 'gemini' | 'ollama' | 'anthropic';
    geminiApiKey: string;
    anthropicApiKey: string;
    ollamaHost: string;
    ollamaModel: string;
  },
): Promise<DescribeResult> => {
  if (config.provider === 'ollama') {
    const { describeMealWithOllama } = await import('./ollama');
    return describeMealWithOllama(description, config.ollamaHost, config.ollamaModel);
  }
  if (config.provider === 'anthropic') {
    return describeMeal(description, config.anthropicApiKey);
  }
  const { describeMealWithGemini } = await import('./geminiDescribe');
  return describeMealWithGemini(description, config.geminiApiKey);
};
```

`MODEL_PRICING` is not extended. `estimateCostUsd` already returns null for an unknown model rather than pricing it from the wrong list, which is the correct behaviour for a call the user is not billed for.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run typecheck`

```bash
git add mobile/src/ai/geminiDescribe.ts mobile/src/ai/__tests__/geminiDescribe.test.ts mobile/src/ai/describeMeal.ts
git commit -m "feat(ai): estimate meals with Gemini

Shares SYSTEM_PROMPT with the Claude path so the eval compares providers
rather than prompts, and validates with the same zod schema, so Gemini's
responseSchema stays a hint rather than becoming the boundary.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

### Task 5: Settings and the new default

**Files:**
- Modify: `mobile/src/state/settings.ts`
- Modify: `mobile/app/(tabs)/settings.tsx:283-320`
- Modify: `mobile/app/describe.tsx:85-96,177-180`

**Interfaces:**
- Consumes: `estimateMeal` from Task 4.
- Produces: `AppSettings['aiProvider']` widened to `'gemini' | 'ollama' | 'anthropic'`, defaulting to `'gemini'`.

- [ ] **Step 1: Widen the provider type and move the default**

In `mobile/src/state/settings.ts`, replace the `aiProvider` field and its comment:

```ts
  /**
   * Which engine estimates a described meal.
   *
   * 'gemini' is the default because it is the only one that works on a fresh
   * install: 'ollama' needs the user's own machine running a server the phone
   * can reach, and 'anthropic' needs a key. Both stay available — local is
   * free and private, and the key path keeps anyone off the shared allowance.
   */
  aiProvider: 'gemini' | 'ollama' | 'anthropic';
```

And in `DEFAULT_SETTINGS`:

```ts
  aiProvider: 'gemini',
```

An install that already stored `'ollama'` keeps it. `withDefaults` only fills absent keys, and silently overriding a stored choice would be worse than leaving a working setup alone.

- [ ] **Step 2: Add the option to the picker**

In `mobile/app/(tabs)/settings.tsx`, replace the `options` array of the `Segmented` at line ~306:

```tsx
          options={[
            { value: 'gemini' as const, label: 'Gemini' },
            { value: 'ollama' as const, label: 'Local model' },
            { value: 'anthropic' as const, label: 'Claude API' },
          ]}
```

- [ ] **Step 3: Explain the Gemini option**

Immediately after the `Segmented` in that same `Card`, add the branch for the new provider, before the existing `{settings.aiProvider === 'ollama' ? (` block:

```tsx
        {settings.aiProvider === 'gemini' && (
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Works with no setup. Estimates run on a shared allowance, so they may be
            unavailable if it runs out — adding your own Gemini API key above uses that
            instead, for both meal estimates and restaurant lookups.
          </Text>
        )}
```

- [ ] **Step 4: Update the key's description**

The Gemini key field no longer gates the feature; it overrides the shared path. In the `Card title="Looking up restaurant food"` block at line ~283, replace the explanatory `Text`:

```tsx
        <Text style={[styles.note, { color: colors.textFaint }]}>
          Chain and restaurant meals are not in the food databases, so searches that come
          back empty can offer a web lookup, which shows you the sources it read before you
          save anything. This works with no setup. Add your own Gemini API key to use your
          own allowance instead, for both lookups and meal estimates.
        </Text>
```

- [ ] **Step 5: Pass the key through from the describe screen**

In `mobile/app/describe.tsx` at line ~85, add the new field to the config object:

```tsx
      const result = await estimateMeal(text, {
        provider: settings.aiProvider,
        geminiApiKey: settings.foodLookup.geminiApiKey,
        anthropicApiKey: settings.anthropicApiKey,
        ollamaHost: settings.ollamaHost,
```

- [ ] **Step 6: Fix the readiness check**

At line ~177, the screen decides whether the provider is usable. Gemini is always usable, which is the whole point. Replace both lines:

```tsx
  const usingLocal = settings.aiProvider === 'ollama';
  const ready =
    settings.aiProvider === 'gemini'
      ? true
      : usingLocal
        ? settings.ollamaHost.trim().length > 0 && settings.ollamaModel.trim().length > 0
        : settings.anthropicApiKey.trim().length > 0;
```

Read the surrounding lines first and keep the existing `usingLocal` branch exactly as it is — only the `gemini` case is new.

- [ ] **Step 7: Verify it builds headlessly**

Run: `npm test && npm run typecheck && cd mobile && npx expo export --platform android`
Expected: all PASS, export completes. This catches a broken screen without a device.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/state/settings.ts "mobile/app/(tabs)/settings.tsx" mobile/app/describe.tsx
git commit -m "feat(settings): default meal estimates to Gemini

Ollama cannot be a default for anyone but the author: it needs their own
machine running a reachable server, and outside Expo Go defaultOllamaHost()
has no dev server to read a LAN address from and falls back to loopback.
Both other providers stay available; an install that already chose one
keeps it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

### Task 6: Measure the hosted path

**Files:**
- Modify: `evals/meal-estimation/` runner (read it first; it is not inspected by this plan)

**Interfaces:**
- Consumes: `describeMealWithGemini` from Task 4.
- Produces: a results file and a reported table. No source the app imports.

The default has already moved, and this does not gate it. This measures what the hosted path costs in accuracy, which is the kind of thing that degrades silently when nobody looks.

- [ ] **Step 1: Read the existing runner**

Read every file in `evals/meal-estimation/`. Identify how an arm is registered, how cases are tagged `precise`/`vague`, and how results are written. Follow that structure exactly rather than inventing a parallel one.

- [ ] **Step 2: Add a Gemini arm**

Register an arm that calls `describeMealWithGemini(description, apiKey)`, taking the key from `process.env.GEMINI_API_KEY` so the eval bills the author's own key directly and never goes through the proxy — an eval run should not consume the shared allowance or be shaped by proxy behaviour.

- [ ] **Step 3: Confirm the runner cannot spend money on import**

The food-lookup runner previously made a real API call merely by being imported. Verify this runner guards on direct invocation:

```js
const invokedAs = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedAs === import.meta.url) main();
```

If it does not, fix it before running anything.

- [ ] **Step 4: Run it**

Run the eval per its own documented command, with the Gemini arm alongside the existing ones.

- [ ] **Step 5: Report**

Report per tier, split by `precise` and `vague`, in the same table shape used previously. State plainly whether Gemini is better or worse than local qwen and by how much. If it is materially worse, say so and recommend a prompt or model change — do not quietly adjust the default, which is settled on availability grounds.

- [ ] **Step 6: Commit**

```bash
git add evals/meal-estimation
git commit -m "test(eval): add a Gemini arm to meal estimation

Measures what the hosted path costs in accuracy. Does not gate the default,
which is settled on availability: a provider needing the user's own PC is
not a default at any score.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

## Self-review

**Spec coverage.** Shape → Task 1. Sensitive-not-secret → Global Constraints and Task 2 Step 1. Model allowlist → Task 1. `EXPO_PUBLIC_API_BASE` → Task 3. Shared token → Tasks 1–3. Quota cap → the user's, outside this plan; noted in Task 2. Fallback → Task 3. Provider changes → Tasks 4–5. Meal description → Task 4. Error handling → Task 3 Step 3. Testing → each task. Workers wall-clock limitation → Task 2 Step 5, with an explicit stop condition.

**Not covered, deliberately:** the spec's note that the author pays for non-BYO-key users needs no code.

**Type consistency.** `routeFor` is defined in Task 3 and used in Task 4. `ProxyEnv` fields `geminiApiKey`/`proxyToken` match Task 1's route wrapper. `DescribeResult` is reused unchanged from `describeMeal.ts`. The `estimateMeal` config gains `geminiApiKey`, which Task 5 Step 5 supplies from `settings.foodLookup.geminiApiKey` — the same field the lookup path reads, so one key serves both, as the Settings copy in Steps 3–4 states.

**Known gap:** Task 6 modifies files this plan has not read. Its first step is to read them, and it produces nothing the app imports, so a wrong guess there cannot break the build.
