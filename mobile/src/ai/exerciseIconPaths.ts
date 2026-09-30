import { normalisePattern, type MovementPattern } from './exercises';

/**
 * One glyph per movement pattern, on a 24x24 grid.
 *
 * A pattern rather than a drawing of each exercise: one honest glyph covers
 * every row variant, where per-exercise art would need a hundred icons and
 * still miss the next movement someone types. Inline paths rather than bundled
 * assets — no bytes in a PWA already fetching 300 KB of fonts, no licensing,
 * and they are stroke-only, so the caller's colour is the only thing to theme.
 */
export const ICON_PATHS: Record<MovementPattern, string[]> = {
  // A wall on the left, a shaft leaving it and an arrowhead pointing right, away from it
  push: ['M5 5v14', 'M5 12h13', 'M14 8l4 4-4 4'],
  // The same wall, but the arrowhead points left, into it
  pull: ['M5 5v14', 'M7 12h13', 'M11 8l-4 4 4 4'],
  // A loaded bar over bent legs
  squat: ['M4 7h16', 'M8 7v5l-2 6', 'M16 7v5l2 6', 'M8 12h8'],
  // A vertical leg with a foot line, and a torso running up and forward from the hip
  hinge: ['M8 19v-7', 'M8 12l9-4', 'M5 19h6', 'M17 8l3 1'],
  // A split stance
  lunge: ['M7 5v6l-3 8', 'M7 11l6 3v5', 'M4 19h6', 'M13 19h6'],
  // Weight held at the sides, walking
  carry: ['M12 4v10', 'M9 19h6', 'M6 8v8', 'M18 8v8', 'M12 14l-2 5', 'M12 14l2 5'],
  // A braced trunk
  core: ['M4 16h16', 'M7 16a5 5 0 0 1 10 0', 'M12 6v5'],
  // Two short segments meeting at a small ringed joint
  isolation: ['M7 18l5-5', 'M12 13l5 3', 'M12 13m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0'],
};

export const pathsFor = (pattern: unknown): string[] => ICON_PATHS[normalisePattern(pattern)];
