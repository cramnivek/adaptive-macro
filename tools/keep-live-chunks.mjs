/**
 * Copies the code files the live site is serving into a new web build, so a
 * deploy does not pull them out from under a page that is already open.
 *
 * An installed iPhone app can sit in memory across a deploy and then ask for a
 * lazily loaded file by its old hashed name. The manual deploy keeps those by
 * copying the previous build out of `services/gemini-proxy/web/` first, but a
 * CI runner starts from a clean checkout and has no previous build. The live
 * site does, so this reads them from there.
 *
 * Which files: everything listed in the live site's `/code-files.json`, which
 * this script writes into every build it stages, plus everything reachable from
 * the live index.html (all there is to go on the first time, before any list
 * exists). Following index.html alone was the first version, and it lost files:
 * files kept by one deploy are not linked from the page, so the next deploy —
 * even one that only changed a document — could not see them and dropped them.
 *
 * The list records when each file was first deployed, and a file older than
 * RETENTION_DAYS is let go, so the image does not grow without end. A page left
 * open for longer than that is past saving by a few kilobytes anyway.
 *
 * Never overwrites a file the new build has: same name means same content,
 * because the name is a hash of it. A file the live site fails to serve is a
 * warning, not a failure — the deploy matters more than one stale chunk.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Usage, from the repo root:
//   node tools/keep-live-chunks.mjs https://<service>.run.app services/gemini-proxy/web
const [origin, webDir] = process.argv.slice(2);
if (!origin || !webDir) {
  console.error('usage: node tools/keep-live-chunks.mjs <live origin> <web build dir>');
  process.exit(2);
}

const RETENTION_DAYS = 30;
const CHUNK_DIR = '_expo/static/js/web';
const CHUNK = /_expo\/static\/js\/web\/([A-Za-z0-9_.-]+\.js)/g;
const outDir = join(webDir, CHUNK_DIR);
mkdirSync(outDir, { recursive: true });
const now = new Date();

const fetchText = async (path) => {
  const res = await fetch(new URL(path, origin));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
};

// The SPA fallback answers unknown paths with index.html and a 200, so a body
// that starts like HTML is a miss, not a file.
const isHtml = (body) => body.trimStart().startsWith('<');

const namesIn = (text) => [...text.matchAll(CHUNK)].map((m) => m[1]);

/** name -> ISO date first deployed, from the live list if there is one. */
const since = new Map();
try {
  const body = await fetchText('/code-files.json');
  if (!isHtml(body)) {
    for (const [name, date] of Object.entries(JSON.parse(body).files ?? {})) since.set(name, date);
  }
} catch (error) {
  console.warn(`No live code-files.json (${error.message}); going by the live page alone.`);
}

let index = '';
try {
  index = await fetchText('/');
} catch (error) {
  // First deploy, or the site is down: nothing reachable to add.
  console.warn(`Could not read the live site (${error.message}).`);
}

const tooOld = (name) => {
  const first = since.get(name);
  return first !== undefined && now - new Date(first) > RETENTION_DAYS * 86_400_000;
};

const queue = [...new Set([...since.keys(), ...namesIn(index)])];
const seen = new Set(queue);
let kept = 0;
let expired = 0;
while (queue.length > 0) {
  const name = queue.shift();
  if (tooOld(name)) {
    expired += 1;
    continue;
  }
  let body;
  try {
    body = await fetchText(`/${CHUNK_DIR}/${name}`);
  } catch (error) {
    console.warn(`Skipped ${error.message}`);
    continue;
  }
  if (isHtml(body)) {
    console.warn(`Skipped ${name}: the live site answered with HTML`);
    continue;
  }
  const target = join(outDir, name);
  if (!existsSync(target)) {
    writeFileSync(target, body);
    kept += 1;
  }
  for (const next of namesIn(body)) {
    if (!seen.has(next)) {
      seen.add(next);
      queue.push(next);
    }
  }
}

// The list the next deploy reads. A file keeps the date it first went live;
// anything new to the live site starts today.
const files = {};
for (const name of readdirSync(outDir).filter((n) => n.endsWith('.js')).sort()) {
  files[name] = since.get(name) ?? now.toISOString();
}
writeFileSync(join(webDir, 'code-files.json'), `${JSON.stringify({ files }, null, 2)}\n`);

console.log(
  `Kept ${kept} live code files beside the new build, let ${expired} older than ${RETENTION_DAYS} days go; ` +
    `${Object.keys(files).length} listed in code-files.json.`,
);
