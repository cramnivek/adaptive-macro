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
