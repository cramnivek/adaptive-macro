import { describe, expect, it } from 'vitest';
import {
  BODY_OUTLINE,
  MUSCLE_REGIONS,
  REGION_LABELS,
  normaliseRegion,
  pathsForRegion,
} from '../muscleMap';

describe('normaliseRegion', () => {
  it('keeps every region it knows', () => {
    for (const region of MUSCLE_REGIONS) {
      expect(normaliseRegion(region)).toBe(region);
    }
  });

  it('falls back to full_body for a region the model invented', () => {
    // "posterior chain" is a real phrase a model will reach for, and it has
    // nowhere to go on a diagram.
    expect(normaliseRegion('posterior chain')).toBe('full_body');
    expect(normaliseRegion('Lats')).toBe('full_body'); // case matters; the enum is lowercase
    expect(normaliseRegion(undefined)).toBe('full_body');
    expect(normaliseRegion(42)).toBe('full_body');
  });
});

/**
 * Which side each region is drawn on, stated rather than derived.
 *
 * The sheet draws both views, so nothing in production needs to choose one.
 * Writing the expectation out by hand is what makes the next test an assertion
 * about placement rather than a restatement of the table it is checking.
 */
const SIDE: Record<string, 'front' | 'back'> = {
  chest: 'front', shoulders: 'front', biceps: 'front', forearms: 'front',
  abs: 'front', obliques: 'front', quads: 'front', full_body: 'front',
  traps: 'back', upper_back: 'back', lats: 'back', lower_back: 'back',
  triceps: 'back', glutes: 'back', hamstrings: 'back', calves: 'back',
};

describe('pathsForRegion', () => {
  it('draws something for every region on the view it belongs to', () => {
    // The failure this catches is silent: a region nothing matches renders a
    // blank body, which reads as "this exercise works nothing".
    for (const region of MUSCLE_REGIONS) {
      expect(pathsForRegion(region, SIDE[region]).length).toBeGreaterThan(0);
    }
  });

  it('returns nothing rather than undefined for a muscle on the other side', () => {
    // Asking the front for lats is an ordinary thing to do, not an error.
    expect(pathsForRegion('lats', 'front')).toEqual([]);
    expect(pathsForRegion('chest', 'back')).toEqual([]);
  });

  it('draws shoulders and forearms on both sides, because they are on both', () => {
    for (const region of ['shoulders', 'forearms'] as const) {
      expect(pathsForRegion(region, 'front').length).toBeGreaterThan(0);
      expect(pathsForRegion(region, 'back').length).toBeGreaterThan(0);
    }
  });

  it('has a full-body shading on both views', () => {
    expect(pathsForRegion('full_body', 'front').length).toBeGreaterThan(0);
    expect(pathsForRegion('full_body', 'back').length).toBeGreaterThan(0);
  });
});

describe('the figure', () => {
  it('has an outline for both views', () => {
    expect(BODY_OUTLINE.front.length).toBeGreaterThan(0);
    expect(BODY_OUTLINE.back.length).toBeGreaterThan(0);
  });

  it('names every region, so a legend can never show a raw key', () => {
    for (const region of MUSCLE_REGIONS) {
      expect(REGION_LABELS[region]).toBeTruthy();
      expect(REGION_LABELS[region]).not.toBe(region);
    }
  });
});
