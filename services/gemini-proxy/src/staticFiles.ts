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
  '.wasm': 'application/wasm',
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
