/**
 * Renders the movement glyphs to a throwaway HTML page, read straight out of
 * the source so the preview cannot drift from what the app draws.
 *
 * Shown at the three sizes they are actually used at, and on the surfaces they
 * actually sit on: 18px white on the session red (block headers), 20px red on
 * the ground (picker rows), and large for checking the shapes themselves.
 */
import { readFileSync, writeFileSync } from 'node:fs';

// Usage, from the repo root:
//   node tools/preview-glyphs.mjs > /dev/null && open glyphs.html
// Defaults write glyphs.html beside you; it is git-ignored scratch, not an
// artefact to keep.

const source = readFileSync(
  process.argv[2] ?? 'mobile/src/ai/exerciseIconPaths.ts',
  'utf8',
);

const body = source.slice(
  source.indexOf('ICON_PATHS: Record<MovementPattern, string[]> = {'),
  source.indexOf('\n};'),
);

const glyphs = [...body.matchAll(/^\s{2}(\w+): \[(.+)\],$/gm)].map(([, name, list]) => ({
  name,
  paths: [...list.matchAll(/'([^']+)'/g)].map(([, d]) => d),
}));

if (glyphs.length === 0) throw new Error('no glyphs parsed — the source shape changed');

const svg = (paths, size, color, strokeWidth) => `
<svg width="${size}" height="${size}" viewBox="0 0 24 24">
  ${paths
    .map(
      (d) =>
        `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>`,
    )
    .join('\n  ')}
</svg>`;

const INK = '#0A0A0B';
const PAPER = '#F7F5EF';
const LOUD = '#E8352A';

const row = (g) => `
<tr>
  <td class="name">${g.name}</td>
  <td><span class="tab">${svg(g.paths, 18, '#FFFFFF', 2.4)}</span></td>
  <td class="ground">${svg(g.paths, 20, LOUD, 2.4)}</td>
  <td class="ground">${svg(g.paths, 56, PAPER, 2.4)}</td>
  <td class="ground">${svg(g.paths, 56, PAPER, 1.7)}</td>
</tr>`;

writeFileSync(
  process.argv[3] ?? 'glyphs.html',
  `<!doctype html><meta charset="utf-8"><title>glyphs</title>
<style>
  body { background: ${INK}; color: ${PAPER}; font: 13px ui-sans-serif, system-ui; padding: 24px; }
  table { border-collapse: collapse; }
  td { padding: 10px 18px; vertical-align: middle; }
  th { text-align: left; padding: 6px 18px; font-size: 10px; letter-spacing: 1.4px; color: #67676C; text-transform: uppercase; }
  .name { font-family: ui-monospace, monospace; color: ${PAPER}; width: 110px; }
  .tab { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center;
         background: ${LOUD}; transform: skewX(-8deg); }
  .tab svg { transform: skewX(8deg); }
  .ground { background: ${INK}; }
</style>
<table>
  <tr><th>pattern</th><th>18px on the tab</th><th>20px picker</th><th>56px @2.4</th><th>56px @1.7</th></tr>
  ${glyphs.map(row).join('\n')}
</table>`,
);

console.log(`wrote ${glyphs.length} glyphs: ${glyphs.map((g) => g.name).join(', ')}`);
