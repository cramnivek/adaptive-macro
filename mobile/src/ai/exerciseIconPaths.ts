import { normalisePattern, type MovementPattern } from './exercises';

/**
 * One glyph per movement pattern, on a 24x24 grid.
 *
 * A pattern rather than a drawing of each exercise: one honest glyph covers
 * every row variant, where per-exercise art would need a hundred icons and
 * still miss the next movement someone types. Inline paths rather than bundled
 * assets — no bytes in a PWA already fetching 300 KB of fonts, no licensing,
 * and they are stroke-only, so the caller's colour is the only thing to theme.
 *
 * Drawn for 18px on a solid red tab, which is where most of them are actually
 * seen. That size is the whole constraint: at 18px a glyph gets three strokes
 * before it closes up into a blob, so each of these is the fewest lines that
 * still says which movement it is, and they are spaced apart rather than
 * crossing. An earlier set was finer and more detailed and read as scratches
 * on the red.
 */
export const ICON_PATHS: Record<MovementPattern, string[]> = {
  // Your body on the left; the load driven away from it.
  push: ['M4 4v16', 'M8 12h11', 'M15 8l4 4-4 4'],
  // The same body; the load hauled back toward it.
  pull: ['M4 4v16', 'M19 12H8', 'M12 8l-4 4 4 4'],
  // A loaded bar, and the direction the whole thing travels.
  squat: ['M4 7h16', 'M7 12l5 5 5-5'],
  // The hips folding: one upright leg, the torso pitched over it.
  hinge: ['M9 21V12', 'M9 12L19 6'],
  // A split stance: the back leg long and straight, the front knee bent over
  // its own foot. The asymmetry is the whole glyph — drawn symmetrically it is
  // a chevron, and a chevron is already the squat.
  lunge: ['M11 3v8', 'M11 11L4 20', 'M11 11h7v9'],
  // A load hanging either side, and you walking it.
  carry: ['M12 3v13', 'M5 9v8', 'M19 9v8'],
  // A braced trunk holding a line.
  core: ['M3 18h18', 'M6 18a6 6 0 0 1 12 0'],
  // One joint turning, and nothing else moving.
  isolation: ['M6 16a6 6 0 1 1 12 0', 'M6 16l-2-3', 'M6 16l4-1'],
};

export const pathsFor = (pattern: unknown): string[] => ICON_PATHS[normalisePattern(pattern)];
