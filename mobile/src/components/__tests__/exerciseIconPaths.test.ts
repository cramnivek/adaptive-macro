import { describe, expect, it } from 'vitest';
import { MOVEMENT_PATTERNS } from '../../ai/exercises';
import { ICON_PATHS, pathsFor } from '../../ai/exerciseIconPaths';

describe('ICON_PATHS', () => {
  it.each(MOVEMENT_PATTERNS)('has at least one path for %s', (pattern) => {
    expect(ICON_PATHS[pattern]).toBeDefined();
    expect(ICON_PATHS[pattern].length).toBeGreaterThan(0);
  });

  it('has no pattern the enum does not know', () => {
    expect(Object.keys(ICON_PATHS).sort()).toEqual([...MOVEMENT_PATTERNS].sort());
  });

  it('draws a different glyph for every pattern', () => {
    const drawn = Object.values(ICON_PATHS).map((paths) => paths.join('|'));
    expect(new Set(drawn).size).toBe(MOVEMENT_PATTERNS.length);
  });
});

describe('pathsFor', () => {
  it.each(MOVEMENT_PATTERNS)('resolves %s', (pattern) => {
    expect(pathsFor(pattern)).toBe(ICON_PATHS[pattern]);
  });

  // An icon is drawn from whatever the database holds, and a missing glyph is
  // an empty box on screen rather than an error anyone would see.
  it.each([['sprint'], [''], [null], [undefined], [7]])(
    'falls back to the isolation glyph for %o',
    (raw) => {
      expect(pathsFor(raw)).toBe(ICON_PATHS.isolation);
    },
  );
});
