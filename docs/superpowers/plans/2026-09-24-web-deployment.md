# Web Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One URL where the app and its AI features both work, installable to an iOS home screen, with storage the browser will not casually evict.

**Architecture:** The existing Cloud Run service gains a router that dispatches `/api/gemini` to the proxy handler and everything else to a file from the web build, falling back to `index.html` for client-side routes. Same origin, so CORS cannot arise. The app gains a PWA manifest, an iOS install prompt, and a persistent-storage request.

**Tech Stack:** Node 20+ on Google Cloud Run, Expo SDK 57 static web export, expo-router `+html.tsx`, vitest 2, TypeScript 6.

## Global Constraints

- **`toNodeHandler` in `services/gemini-proxy/src/adapter.ts` must not learn about files.** Routing and file reading return a `Response`; the adapter keeps its `(Request) => Promise<Response>` shape. That portability is why moving hosts cost an adapter rather than a rewrite, and it is not to be spent.
- **`handleGeminiProxy` is not modified.** Its fail-closed behaviour and model allowlist are tested and reviewed.
- The Gemini key and proxy token are never written to a file in the repo and never printed by a command.
- The web build is deployed at `services/gemini-proxy/web/`, **not** `dist/` — `.gcloudignore` excludes `dist/`, and naming the web build that would silently ship an empty site.
- Run a workspace's tests with `npm run test --workspace @adaptive-macros/<name>`. Root `npm test` and `npm run typecheck` cover all three.
- Commit after every task. Do not push until the whole plan is green.

---

### Task 1: Static file serving

**Files:**
- Create: `services/gemini-proxy/src/staticFiles.ts`
- Create: `services/gemini-proxy/src/__tests__/staticFiles.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `serveStatic(pathname: string, webRoot: string): Promise<Response | null>` — a `Response` when a file was served, `null` when the caller should fall back.

- [ ] **Step 1: Write the failing test**

Create `services/gemini-proxy/src/__tests__/staticFiles.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { serveStatic } from '../staticFiles';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'webroot-'));
  writeFileSync(join(root, 'index.html'), '<!DOCTYPE html><title>app</title>');
  writeFileSync(join(root, 'favicon.ico'), 'icodata');
  mkdirSync(join(root, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(root, '_expo', 'static', 'js', 'app-abc123.js'), 'console.log(1)');
  // A file OUTSIDE the web root, to prove traversal cannot reach it.
  writeFileSync(join(root, '..', 'outside-secret.txt'), 'SECRET');
});

describe('serveStatic', () => {
  it('serves a file with the right content type', async () => {
    const res = await serveStatic('/favicon.ico', root);

    expect(res?.status).toBe(200);
    expect(res?.headers.get('Content-Type')).toContain('image/');
    expect(await res!.text()).toBe('icodata');
  });

  it('serves javascript with a javascript content type', async () => {
    const res = await serveStatic('/_expo/static/js/app-abc123.js', root);

    expect(res?.status).toBe(200);
    expect(res?.headers.get('Content-Type')).toContain('javascript');
  });

  it('returns null for a path that does not exist, so the caller can fall back', async () => {
    expect(await serveStatic('/describe', root)).toBeNull();
  });

  // This is the reason this module exists as its own tested unit. The service
  // is public and unauthenticated; a traversal bug turns it into a file
  // server for the container.
  it('refuses to escape the web root', async () => {
    for (const attack of [
      '/../outside-secret.txt',
      '/..%2Foutside-secret.txt',
      '/_expo/../../outside-secret.txt',
      '/%2e%2e/outside-secret.txt',
      '//....//outside-secret.txt',
    ]) {
      const res = await serveStatic(attack, root);
      if (res) expect(await res.text()).not.toContain('SECRET');
    }
  });

  it('does not serve a directory as if it were a file', async () => {
    expect(await serveStatic('/_expo', root)).toBeNull();
  });

  // Content-hashed bundles may be cached forever; index.html must not be, or
  // a deploy never reaches anyone who has already loaded the site.
  it('caches hashed assets immutably and index.html not at all', async () => {
    const asset = await serveStatic('/_expo/static/js/app-abc123.js', root);
    const html = await serveStatic('/index.html', root);

    expect(asset?.headers.get('Cache-Control')).toContain('immutable');
    expect(html?.headers.get('Cache-Control')).toContain('no-cache');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/marca/adaptive-macro && npm run test --workspace @adaptive-macros/gemini-proxy -- staticFiles`
Expected: FAIL — `Failed to resolve import "../staticFiles"`.

- [ ] **Step 3: Write the implementation**

Create `services/gemini-proxy/src/staticFiles.ts`:

```ts
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';

/**
 * Serves the exported web build.
 *
 * Returns a Response rather than writing to a socket, so the service keeps one
 * shape end to end and the node:http adapter never learns about files.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const contentType = (path: string): string => {
  const dot = path.lastIndexOf('.');
  return (dot === -1 ? undefined : TYPES[path.slice(dot).toLowerCase()]) ?? 'application/octet-stream';
};

/**
 * Everything under `_expo/static` carries a content hash in its filename, so a
 * changed file is a changed URL and the old one can be cached forever.
 * `index.html` is the opposite: its URL never changes, so caching it would
 * pin users to whatever build they first loaded.
 */
const cacheControl = (path: string): string =>
  path.startsWith('/_expo/static/') ? 'public, max-age=31536000, immutable' : 'no-cache';

export const serveStatic = async (
  pathname: string,
  webRoot: string,
): Promise<Response | null> => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape is not a path we should guess at.
    return null;
  }

  // Normalise first, then confirm the result is still inside the root. Checking
  // the raw string for '..' is the version of this that keeps getting bypassed;
  // comparing resolved absolute paths is the version that holds.
  const root = resolve(webRoot);
  const target = resolve(join(root, normalize(decoded)));
  if (target !== root && !target.startsWith(root + sep)) return null;

  try {
    const info = await stat(target);
    if (!info.isFile()) return null;
    const body = await readFile(target);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': contentType(target),
        'Cache-Control': cacheControl(decoded),
      },
    });
  } catch {
    return null;
  }
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /c/Users/marca/adaptive-macro && npm run test --workspace @adaptive-macros/gemini-proxy -- staticFiles`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add services/gemini-proxy/src/staticFiles.ts services/gemini-proxy/src/__tests__/staticFiles.test.ts
git commit -m "feat(proxy): serve static files as Responses

Returns a Response rather than writing to a socket, so the node:http
adapter never learns about files and the handler keeps one shape.

Path traversal is rejected by comparing resolved absolute paths rather
than screening the raw string for '..', which is the version that holds.
The service is public and unauthenticated, so a traversal bug here would
turn it into a file server for the container.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

### Task 2: Routing

**Files:**
- Create: `services/gemini-proxy/src/router.ts`
- Create: `services/gemini-proxy/src/__tests__/router.test.ts`
- Modify: `services/gemini-proxy/src/adapter.ts` (remove the `GET /` health branch)
- Modify: `services/gemini-proxy/src/__tests__/adapter.test.ts` (the health test moves)
- Modify: `services/gemini-proxy/src/index.ts`

**Interfaces:**
- Consumes: `serveStatic` from Task 1; `handleGeminiProxy` and `ProxyEnv` unchanged.
- Produces: `createRouter(opts: { env: ProxyEnv; webRoot: string }): (request: Request) => Promise<Response>`.

**Note on the health probe.** `adapter.ts` currently answers `GET /` with the text `ok`, which was correct when nothing else lived at `/`. It is now the homepage. The health check moves to `/healthz` in the router, where it stays independent of whether the web build is present — a container that answers `/healthz` but 404s `/` is misconfigured, and telling those apart matters. **Do not simply delete the adapter's health test; change it to assert that `GET /` now reaches the handler.**

- [ ] **Step 1: Write the failing test**

Create `services/gemini-proxy/src/__tests__/router.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRouter } from '../router';

let webRoot: string;
const env = { geminiApiKey: 'server-key', proxyToken: 'shared-token' };

beforeAll(() => {
  webRoot = mkdtempSync(join(tmpdir(), 'router-'));
  writeFileSync(join(webRoot, 'index.html'), '<!DOCTYPE html><title>app</title>');
  mkdirSync(join(webRoot, '_expo'), { recursive: true });
  writeFileSync(join(webRoot, '_expo', 'bundle-abc.js'), 'console.log(1)');
});

afterEach(() => vi.unstubAllGlobals());

const get = (path: string) => new Request(`https://x.test${path}`);
const post = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://x.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: '{"contents":[]}',
  });

describe('createRouter', () => {
  it('serves index.html at the root', async () => {
    const res = await createRouter({ env, webRoot })(get('/'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('<title>app</title>');
  });

  it('serves a real asset', async () => {
    const res = await createRouter({ env, webRoot })(get('/_expo/bundle-abc.js'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('javascript');
  });

  // expo-router uses client-side paths. Opening or refreshing /describe must
  // give the app, not a 404.
  it('falls back to index.html for a client-side route', async () => {
    const res = await createRouter({ env, webRoot })(get('/describe'));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>app</title>');
  });

  it('answers /healthz without touching the web build', async () => {
    const res = await createRouter({ env, webRoot: '/nonexistent' })(get('/healthz'));

    expect(res.status).toBe(200);
  });

  // The whole point of co-hosting: the API is same-origin, so no CORS.
  it('routes /api/gemini to the proxy, which still rejects a missing token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await createRouter({ env, webRoot })(post('/api/gemini'));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes /api/gemini with a valid token through to the proxy', async () => {
    const fetchMock = vi.fn(async () => new Response('{"candidates":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await createRouter({ env, webRoot })(
      post('/api/gemini', { 'x-proxy-token': 'shared-token', 'x-gemini-model': 'gemini-3.5-flash' }),
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  // A stray POST must not be answered with the homepage, which would look
  // like success to a client that is actually calling the wrong path.
  it('does not serve the SPA fallback for a non-GET request', async () => {
    const res = await createRouter({ env, webRoot })(post('/not-a-route'));

    expect(res.status).toBe(404);
  });

  it('404s an unknown path when the web build is absent', async () => {
    const res = await createRouter({ env, webRoot: '/nonexistent' })(get('/anything'));

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/marca/adaptive-macro && npm run test --workspace @adaptive-macros/gemini-proxy -- router`
Expected: FAIL — `Failed to resolve import "../router"`.

- [ ] **Step 3: Write the router**

Create `services/gemini-proxy/src/router.ts`:

```ts
import { type ProxyEnv, handleGeminiProxy } from './geminiProxy.js';
import { serveStatic } from './staticFiles.js';

/**
 * Dispatches one origin between the API and the web build.
 *
 * Co-hosting is the point: the app and `/api/gemini` share an origin, so the
 * browser never runs a CORS preflight and the shared token never crosses an
 * origin boundary. An earlier design had the site and the API on separate
 * hosts, which failed every call with `TypeError: Failed to fetch` and would
 * have needed an allowlist kept correct forever.
 */
export const createRouter = (opts: { env: ProxyEnv; webRoot: string }) => {
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);

    // Independent of the web build on purpose: a container that answers this
    // but 404s `/` is misconfigured rather than dead, and that is worth being
    // able to tell apart.
    if (pathname === '/healthz') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }

    if (pathname === '/api/gemini') {
      return handleGeminiProxy(request, opts.env);
    }

    // Only GET and HEAD can be a page. Answering a stray POST with the
    // homepage would read as success to a client calling the wrong path.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Not found', { status: 404 });
    }

    const file = await serveStatic(pathname, opts.webRoot);
    if (file) return file;

    // expo-router resolves paths on the client, so an unmatched path is a
    // route rather than a miss — unless index.html itself is absent, which
    // means the web build was not deployed.
    const index = await serveStatic('/index.html', opts.webRoot);
    return index ?? new Response('Not found', { status: 404 });
  };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /c/Users/marca/adaptive-macro && npm run test --workspace @adaptive-macros/gemini-proxy -- router`
Expected: PASS, 8 tests.

- [ ] **Step 5: Move the health branch out of the adapter**

In `services/gemini-proxy/src/adapter.ts`, delete this block and its comment:

```ts
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(Buffer.from('ok'));
      return;
    }
```

- [ ] **Step 6: Update the adapter test that pinned it**

In `services/gemini-proxy/src/__tests__/adapter.test.ts`, the test named `'answers a health probe on GET / without invoking the handler'` asserted the branch you just removed. Replace it — do not delete it — so it pins the new contract:

```ts
  // The health branch moved to the router, where it can answer /healthz
  // independently of the web build. `/` is now the homepage and must reach
  // the handler like any other path.
  it('passes GET / through to the handler now that it is the homepage', async () => {
    let called = false;
    const handler = toNodeHandler(async () => {
      called = true;
      return new Response('<!DOCTYPE html>', { status: 200 });
    });

    const res = fakeRes();
    await handler(fakeReq('GET', '/', {}) as any, res as any);

    expect(called).toBe(true);
    expect(res.statusCode).toBe(200);
  });
```

- [ ] **Step 7: Wire the router into the entrypoint**

Replace `services/gemini-proxy/src/index.ts` entirely:

```ts
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
```

- [ ] **Step 8: Verify the whole suite**

Run: `cd /c/Users/marca/adaptive-macro && npm test && npm run typecheck`
Expected: all PASS. The proxy workspace is now 24 tests (6 proxy + 4 adapter + 6 static + 8 router).

- [ ] **Step 9: Commit**

```bash
git add services/gemini-proxy/src package.json
git commit -m "feat(proxy): co-host the web build with the API

One origin serves both, so the browser never runs a CORS preflight and
the shared token never crosses an origin boundary. Deployed separately,
every call failed with TypeError: Failed to fetch, and the alternative
was a CORS allowlist that has to stay correct forever.

The health check moves from the adapter's GET / branch to /healthz in the
router, because / is now the homepage. /healthz stays independent of the
web build so a misconfigured container is distinguishable from a dead one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

### Task 3: Installable web app

**Files:**
- Create: `mobile/app/+html.tsx`
- Create: `mobile/public/manifest.json`
- Create: `mobile/public/icon-192.png`, `mobile/public/icon-512.png` (generated from `mobile/assets/icon.png`)

**Interfaces:**
- Consumes: nothing.
- Produces: a web export whose `index.html` links a manifest and declares iOS standalone capability.

**Why this task is durability, not polish.** iOS Safari deletes script-writable storage after seven days of non-use, which is what `expo-sqlite` runs on for web. Web apps added to the home screen are exempt. The install is the mechanism that keeps a diary alive.

- [ ] **Step 1: Generate the icons**

Expo's `assets/icon.png` is the source. Produce two square PNGs:

```bash
cd /c/Users/marca/adaptive-macro/mobile && mkdir -p public
node -e "
const s=require('sharp');
" 2>/dev/null && echo "sharp available" || echo "no sharp - use the fallback below"
```

If `sharp` is unavailable, do not add a dependency for this. Copy the source icon at full size to both names and record in your report that they are unresized:

```bash
cd /c/Users/marca/adaptive-macro/mobile && cp assets/icon.png public/icon-192.png && cp assets/icon.png public/icon-512.png
```

An oversized icon renders correctly; a missing one does not.

- [ ] **Step 2: Write the manifest**

Create `mobile/public/manifest.json`:

```json
{
  "name": "Adaptive Macros",
  "short_name": "Macros",
  "description": "Local-first nutrition tracker with an adaptive TDEE engine",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0B1220",
  "theme_color": "#0B1220",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`background_color` and `theme_color` match the Android adaptive icon background already in `app.json`, so the splash does not flash a different colour.

- [ ] **Step 3: Customise the HTML shell**

Create `mobile/app/+html.tsx`. expo-router renders this once per page at export time; it is not a client component and must not use hooks or state.

```tsx
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML shell for every web page.
 *
 * Carries the manifest and the Apple-specific meta tags, which are what make
 * Add to Home Screen produce a standalone app rather than a bookmark — and on
 * iOS that install is what exempts the database from Safari's seven-day
 * eviction of script-writable storage.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0B1220" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Macros" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify the manifest reaches the export**

```bash
cd /c/Users/marca/adaptive-macro/mobile && rm -rf dist && npx expo export --platform web
grep -o 'rel="manifest"' dist/index.html
grep -o 'apple-mobile-web-app-capable' dist/index.html
ls dist/manifest.json dist/icon-192.png dist/icon-512.png
```

Expected: both greps match, and all three files exist at the export root. If `public/` was not copied, stop and report — the manifest is the whole task.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/+html.tsx mobile/public
git commit -m "feat(web): make the app installable to a home screen

iOS Safari deletes script-writable storage after seven days of non-use,
which is what expo-sqlite runs on for web. Home-screen installs are
exempt, so the manifest and the Apple meta tags are the mechanism that
keeps a diary alive rather than a cosmetic upgrade.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

### Task 4: Persistent storage and the install prompt

**Files:**
- Create: `mobile/src/web/persistence.ts`
- Create: `mobile/src/web/__tests__/persistence.test.ts`
- Modify: `mobile/app/_layout.tsx` (request persistence once at startup)
- Modify: `mobile/app/(tabs)/settings.tsx` (install guidance on iOS web)

**Interfaces:**
- Consumes: nothing.
- Produces: `requestPersistentStorage(): Promise<'persisted' | 'denied' | 'unsupported'>` and `needsHomeScreenInstall(): boolean`.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/web/__tests__/persistence.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { needsHomeScreenInstall, requestPersistentStorage } from '../persistence';

afterEach(() => vi.unstubAllGlobals());

const withNavigator = (nav: unknown) => vi.stubGlobal('navigator', nav);

describe('requestPersistentStorage', () => {
  it('reports unsupported where the API is absent, without throwing', async () => {
    withNavigator({});
    expect(await requestPersistentStorage()).toBe('unsupported');
  });

  it('does not re-request when already persisted', async () => {
    const persist = vi.fn();
    withNavigator({ storage: { persisted: async () => true, persist } });

    expect(await requestPersistentStorage()).toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence when not yet granted', async () => {
    const persist = vi.fn(async () => true);
    withNavigator({ storage: { persisted: async () => false, persist } });

    expect(await requestPersistentStorage()).toBe('persisted');
    expect(persist).toHaveBeenCalled();
  });

  it('reports denial rather than pretending it worked', async () => {
    withNavigator({ storage: { persisted: async () => false, persist: async () => false } });
    expect(await requestPersistentStorage()).toBe('denied');
  });

  // Called at startup: a throw here must never take the app down with it.
  it('survives the API throwing', async () => {
    withNavigator({ storage: { persisted: async () => { throw new Error('nope'); } } });
    expect(await requestPersistentStorage()).toBe('unsupported');
  });
});

describe('needsHomeScreenInstall', () => {
  it('is true for iOS Safari in a browser tab', () => {
    withNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari' });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });

    expect(needsHomeScreenInstall()).toBe(true);
  });

  it('is false once running standalone from the home screen', () => {
    withNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari' });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });

    expect(needsHomeScreenInstall()).toBe(false);
  });

  it('is false off iOS, where the seven-day rule does not apply', () => {
    withNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });

    expect(needsHomeScreenInstall()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/marca/adaptive-macro && npm run test --workspace @adaptive-macros/mobile -- persistence`
Expected: FAIL — `Failed to resolve import "../persistence"`.

- [ ] **Step 3: Write the implementation**

Create `mobile/src/web/persistence.ts`:

```ts
/**
 * Browser storage durability.
 *
 * The diary lives in OPFS via expo-sqlite on web, and browsers treat that as
 * evictable by default — measured on a real deployment, `persisted()` returned
 * false. Asking costs one call at startup.
 *
 * On iOS none of this is sufficient on its own: Safari deletes script-writable
 * storage after seven days without use, and only a home-screen install is
 * exempt. Hence the second function.
 */

export const requestPersistentStorage = async (): Promise<
  'persisted' | 'denied' | 'unsupported'
> => {
  try {
    const storage = (globalThis.navigator as any)?.storage;
    if (!storage?.persisted || !storage?.persist) return 'unsupported';
    if (await storage.persisted()) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'denied';
  } catch {
    // Called during startup; a storage API that throws must not stop the app.
    return 'unsupported';
  }
};

/** True when this is iOS in a browser tab, where the diary will be deleted. */
export const needsHomeScreenInstall = (): boolean => {
  try {
    const ua = (globalThis.navigator as any)?.userAgent ?? '';
    const isIos = /iPhone|iPad|iPod/.test(ua);
    if (!isIos) return false;
    const standalone = (globalThis as any).window?.matchMedia?.('(display-mode: standalone)');
    return !standalone?.matches;
  } catch {
    return false;
  }
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /c/Users/marca/adaptive-macro && npm run test --workspace @adaptive-macros/mobile -- persistence`
Expected: PASS, 8 tests.

- [ ] **Step 5: Request persistence at startup**

Read `mobile/app/_layout.tsx` first. Add a web-only, fire-and-forget call inside the existing startup effect — or a new `useEffect` with an empty dependency array if there is none. It must not block render and must not be awaited:

```tsx
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    void import('../src/web/persistence').then(({ requestPersistentStorage }) =>
      requestPersistentStorage(),
    );
  }, []);
```

Import `Platform` from `react-native` if it is not already imported. The dynamic import keeps this module out of the native bundles.

- [ ] **Step 6: Add install guidance on iOS web**

Read `mobile/app/(tabs)/settings.tsx` around the existing `Card` components and follow their shape exactly. Add a card that renders only when `needsHomeScreenInstall()` is true, placed **first** in the screen so it is not missed:

```tsx
        <Card title="Add to your home screen">
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Safari deletes a website's saved data after seven days without use, and that
            includes your diary. Adding this to your home screen exempts it — tap Share,
            then Add to Home Screen, then open it from there from now on.
          </Text>
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Until you do, export a backup below if you have anything you would mind losing.
          </Text>
        </Card>
```

State the consequence plainly. A user who reads this as a suggestion and skips it loses their data, so it should not read as a suggestion.

- [ ] **Step 7: Verify headlessly**

Run: `cd /c/Users/marca/adaptive-macro && npm test && npm run typecheck && cd mobile && rm -rf dist && npx expo export --platform web && npx expo export --platform android`
Expected: all PASS, both exports succeed. Android is exported too because Task 4 touches `_layout.tsx`, which every platform loads.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/web mobile/app/_layout.tsx "mobile/app/(tabs)/settings.tsx"
git commit -m "feat(web): request persistent storage and prompt the iOS install

navigator.storage.persist() was never called, so the diary was evictable
even on Chrome -- measured as persisted: false on a real deployment. That
was a defect on every platform, not only on web.

On iOS the API is not enough: Safari deletes script-writable storage after
seven days without use and only a home-screen install is exempt, so the
prompt states the consequence rather than suggesting an improvement.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JjdynanDTyc2RBmpafgjLt"
```

---

### Task 5: Deploy and verify

**Files:**
- Modify: `services/gemini-proxy/.gcloudignore`
- Create: `services/gemini-proxy/README.md` additions (deploy section)

This task is manual. Its deliverable is a verified URL.

- [ ] **Step 1: Make sure the web build ships**

`.gcloudignore` excludes `dist/`. The web build goes to `web/`, which must **not** be excluded. Confirm:

```bash
cd /c/Users/marca/adaptive-macro && cat services/gemini-proxy/.gcloudignore
```

If any line would exclude `web/`, fix it. Add a comment saying why it must stay.

- [ ] **Step 2: Build and stage**

```bash
cd /c/Users/marca/adaptive-macro/mobile && rm -rf dist && npx expo export --platform web
rm -rf ../services/gemini-proxy/web && cp -r dist ../services/gemini-proxy/web
ls ../services/gemini-proxy/web/index.html ../services/gemini-proxy/web/manifest.json
```

- [ ] **Step 3: Run it locally before deploying**

```bash
cd /c/Users/marca/adaptive-macro/services/gemini-proxy && npm run build
PORT=8080 GEMINI_API_KEY=x PROXY_TOKEN=y npm start &
sleep 2
curl -s -o /dev/null -w "healthz: %{http_code}\n" http://localhost:8080/healthz
curl -s -o /dev/null -w "root:    %{http_code}\n" http://localhost:8080/
curl -s -o /dev/null -w "spa:     %{http_code}\n" http://localhost:8080/describe
curl -s -o /dev/null -w "manifest:%{http_code}\n" http://localhost:8080/manifest.json
curl -s -o /dev/null -w "traverse:%{http_code}\n" "http://localhost:8080/../package.json"
curl -s -o /dev/null -w "api401:  %{http_code}\n" -X POST http://localhost:8080/api/gemini -H "Content-Type: application/json" -d '{}'
```

Expected: `200, 200, 200, 200, 404, 401`. The traversal check returning anything but 404 stops the task.

Kill the background server: `netstat -ano | grep ':8080' | grep -i LISTENING`, then `taskkill //PID <pid> //F`.

- [ ] **Step 4: Deploy**

```bash
cd /c/Users/marca/adaptive-macro/services/gemini-proxy
gcloud run deploy gemini-proxy --source . --region asia-southeast1 \
  --allow-unauthenticated --timeout 120 --quiet
```

Environment variables are already set on the service and are preserved across deploys — do not pass `--set-env-vars`, which would replace them wholesale.

`gcloud` needs `CLOUDSDK_PYTHON` pointed at the SDK's bundled interpreter on this machine; see the service README.

- [ ] **Step 5: Verify the deployment**

Repeat Step 3's six checks against the deployed URL, then confirm the API works same-origin from the page itself rather than by curl — that is the thing CORS was breaking. In a browser console on the deployed site:

```js
await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.status)
```

Expected: `401`, **reached** — not a `TypeError`. A 401 proves the request completed and the gate answered. A `TypeError` means CORS is still in play and co-hosting did not take effect.

- [ ] **Step 6: Report what still needs a real iPhone**

Do not claim the feature works. Report the URL and the manual checklist: open in Safari, Add to Home Screen, log a weight, fully close, reopen from the home screen, confirm the weight persists. Until that passes, iOS is unverified.

---

## Self-review

**Spec coverage.** Co-hosting → Tasks 1–2. SPA fallback → Task 2. Health probe relocation → Task 2, with the adapter test changed rather than deleted. PWA manifest and iOS meta → Task 3. `navigator.storage.persist()` → Task 4. Install prompt → Task 4. Export prominence → **not covered**; the spec's "make the backup obvious" is a UI change I have deliberately left out rather than specify vaguely, and it should be its own small task once someone has used the site. Barcode degradation → no work needed, already verified correct. iOS verification → Task 5 Step 6, explicitly not claimable.

**Placeholder scan.** None. Task 3 Step 1 has a conditional (icon resizing) with both branches specified and a stated fallback.

**Type consistency.** `serveStatic(pathname, webRoot) => Promise<Response | null>` is defined in Task 1 and consumed in Task 2. `createRouter({ env, webRoot })` matches `index.ts` in Task 2 Step 7. `ProxyEnv` is unchanged from the existing service. `requestPersistentStorage` and `needsHomeScreenInstall` are defined in Task 4 and used in Steps 5 and 6 of the same task.

**Known risk.** Task 3 assumes expo-router copies `mobile/public/` to the export root. Step 4 verifies that explicitly and stops the task if it did not, rather than discovering it at deploy.
