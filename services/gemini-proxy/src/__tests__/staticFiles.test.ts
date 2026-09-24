import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
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
  //
  // These are rejected because normalize() collapses the leading '..' and
  // nothing exists at the collapsed path — not by the boundary check, which a
  // leading-slash pathname cannot reach. They are still worth pinning: they
  // are the shapes an attacker sends, and this asserts the observable contract
  // that every one returns null.
  it('rejects traversal-shaped paths', async () => {
    const attacks = [
      '/../outside-secret.txt',
      '/..%2Foutside-secret.txt',
      '/_expo/../../outside-secret.txt',
      '/%2e%2e/outside-secret.txt',
      '//....//outside-secret.txt',
      '/..\\outside-secret.txt',
      '/..%5Coutside-secret.txt',
      '/%252e%252e/outside-secret.txt',
      '/outside-secret.txt%00.js',
    ];
    expect.assertions(attacks.length);
    for (const attack of attacks) {
      expect(await serveStatic(attack, root), `should reject ${attack}`).toBeNull();
    }
  });

  // The nine attacks above are all rejected by ENOENT: normalize() strips a
  // leading '..' before the boundary check runs, so no leading-slash pathname
  // can reach it. This case can — it passes a path with no leading slash,
  // which no HTTP pathname has. It exists to pin the boundary check as
  // defence in depth against a caller that violates the pathname contract,
  // not against anything reachable from the network.
  it('rejects a caller-supplied relative path that escapes the root', async () => {
    expect(await serveStatic('../outside-secret.txt', root)).toBeNull();
  });

  it('does not serve a directory as if it were a file', async () => {
    expect(await serveStatic('/_expo', root)).toBeNull();
  });

  // stat() follows symlinks, so the requested path can look safe while the
  // file it resolves to is not. Flagged independently by a code review and an
  // automated scan; not reachable in today's build, which is not a guarantee.
  it('refuses a symlink that points outside the web root', async () => {
    const link = join(root, 'escape-link.txt');
    try {
      symlinkSync(join(root, '..', 'outside-secret.txt'), link);
    } catch {
      return; // Windows needs privileges for symlinks; skip rather than fail.
    }

    expect(await serveStatic('/escape-link.txt', root)).toBeNull();
  });

  // Content-hashed bundles may be cached forever; index.html must not be, or
  // a deploy never reaches anyone who has already loaded the site.
  it('caches hashed assets immutably and index.html not at all', async () => {
    const asset = await serveStatic('/_expo/static/js/app-abc123.js', root);
    const html = await serveStatic('/index.html', root);

    expect(asset?.headers.get('Cache-Control')).toContain('immutable');
    expect(html?.headers.get('Cache-Control')).toContain('no-cache');
  });

  // expo-sqlite ships its SQLite engine as wasm, and WebAssembly.instantiateStreaming
  // requires this exact type or it throws and falls back to a slower path.
  it('serves wasm with the exact type streaming compilation requires', async () => {
    writeFileSync(join(root, 'engine.wasm'), 'fakewasm');
    const res = await serveStatic('/engine.wasm', root);

    expect(res?.headers.get('Content-Type')).toBe('application/wasm');
  });
});
