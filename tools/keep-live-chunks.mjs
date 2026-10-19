/**
 * Copies the code files the live site is serving into a new web build, so a
 * deploy does not pull them out from under a page that is already open.
 *
 * An installed iPhone app can sit in memory across a deploy and then ask for a
 * lazily loaded file by its old hashed name. The manual deploy keeps those by
 * copying the previous build out of `services/gemini-proxy/web/` first, but a
 * CI runner starts from a clean checkout and has no previous build. The live
 * site does, so this reads them from there: the entry file named in its
 * index.html, then every file that one names, and so on.
 *
 * Never overwrites a file the new build has: same name means same content,
 * because the name is a hash of it. A file the live site fails to serve is a
 * warning, not a failure — the deploy matters more than one stale chunk.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Usage, from the repo root:
//   node tools/keep-live-chunks.mjs https://<service>.run.app services/gemini-proxy/web
const [origin, webDir] = process.argv.slice(2);
if (!origin || !webDir) {
  console.error('usage: node tools/keep-live-chunks.mjs <live origin> <web build dir>');
  process.exit(2);
}

const CHUNK = /_expo\/static\/js\/web\/[A-Za-z0-9_.-]+\.js/g;
const outDir = join(webDir, '_expo/static/js/web');
mkdirSync(outDir, { recursive: true });

const fetchText = async (path) => {
  const res = await fetch(new URL(path, origin));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
};

let index;
try {
  index = await fetchText('/');
} catch (error) {
  // First deploy, or the site is down: there is nothing open to protect.
  console.warn(`Could not read the live site (${error.message}); keeping nothing.`);
  process.exit(0);
}

const queue = [...new Set(index.match(CHUNK) ?? [])];
const seen = new Set(queue);
let kept = 0;
while (queue.length > 0) {
  const path = queue.shift();
  let body;
  try {
    body = await fetchText(`/${path}`);
  } catch (error) {
    console.warn(`Skipped ${error.message}`);
    continue;
  }
  // The SPA fallback answers unknown paths with index.html and a 200; that is
  // not a chunk, and keeping it under a .js name would break the page that asks.
  if (body.trimStart().startsWith('<')) {
    console.warn(`Skipped /${path}: the live site answered with HTML`);
    continue;
  }
  const target = join(outDir, path.split('/').pop());
  if (!existsSync(target)) {
    writeFileSync(target, body);
    kept += 1;
  }
  for (const next of body.match(CHUNK) ?? []) {
    if (!seen.has(next)) {
      seen.add(next);
      queue.push(next);
    }
  }
}
console.log(`Kept ${kept} of ${seen.size} live code files alongside the new build.`);
