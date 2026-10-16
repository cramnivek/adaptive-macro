import { describe, expect, it } from 'vitest';
import { BUILTIN_CATALOGUE, findBuiltinCatalogueEntry } from '../builtinCatalogue';

describe('builtinCatalogue', () => {
  it('contains rich details, muscle regions, and steps for all built-in exercises', () => {
    expect(BUILTIN_CATALOGUE.length).toBeGreaterThanOrEqual(20);
    for (const entry of BUILTIN_CATALOGUE) {
      expect(entry.primaryRegion).not.toBeNull();
      expect(entry.steps.length).toBeGreaterThanOrEqual(3);
      expect(entry.instructions).toBeTruthy();
    }
  });

  it('resolves exact names, aliases, and reordered parenthetical names', () => {
    const bench = findBuiltinCatalogueEntry('Bench Press (Barbell)');
    expect(bench).not.toBeNull();
    expect(bench?.primaryRegion).toBe('chest');
    expect(bench?.steps.length).toBeGreaterThanOrEqual(3);

    const barbellBench = findBuiltinCatalogueEntry('Barbell Bench Press');
    expect(barbellBench).not.toBeNull();
    expect(barbellBench?.primaryRegion).toBe('chest');

    const pulldown = findBuiltinCatalogueEntry('Lat Pulldown (Cable)');
    expect(pulldown).not.toBeNull();
    expect(pulldown?.primaryRegion).toBe('lats');
    expect(pulldown?.movementPattern).toBe('pull');
  });
});
