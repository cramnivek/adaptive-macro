import { normalisePattern, type MovementPattern } from './exercises';

/**
 * One glyph per movement pattern, on a 24x24 grid.
 *
 * A pattern rather than a drawing of each exercise: one honest glyph covers
 * every row variant, where per-exercise art would need a hundred icons and
 * still miss the next movement someone types. Inline paths rather than bundled
 * assets — no bytes in a PWA already fetching 300 KB of fonts, no licensing,
 * and they inherit currentColor so they theme for free.
 */
export const ICON_PATHS: Record<MovementPattern, string[]> = {
  // A bar pressed away from a body
  push: ['M4 12h6', 'M14 6v12', 'M17 8v8', 'M20 10v4'],
  // A bar drawn toward a body
  pull: ['M20 12h-6', 'M10 6v12', 'M7 8v8', 'M4 10v4'],
  // A loaded bar over bent legs
  squat: ['M4 7h16', 'M8 7v5l-2 6', 'M16 7v5l2 6', 'M8 12h8'],
  // A hinge at the hip, bar hanging
  hinge: ['M5 6h9a4 4 0 0 1 0 8H9', 'M9 14v5', 'M4 19h10'],
  // A split stance
  lunge: ['M7 5v6l-3 8', 'M7 11l6 3v5', 'M4 19h6', 'M13 19h6'],
  // Weight held at the sides, walking
  carry: ['M12 4v10', 'M9 19h6', 'M6 8v8', 'M18 8v8', 'M12 14l-2 5', 'M12 14l2 5'],
  // A braced trunk
  core: ['M4 16h16', 'M7 16a5 5 0 0 1 10 0', 'M12 6v5'],
  // A single joint moving
  isolation: ['M8 19V9a4 4 0 0 1 8 0v10', 'M6 19h12'],
};

export const pathsFor = (pattern: unknown): string[] => ICON_PATHS[normalisePattern(pattern)];
