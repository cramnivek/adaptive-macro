import { describe, expect, it } from 'vitest';
import { cameraProblem, frameRegionUnder, lacksAutofocus, scanZoom } from '../scanGeometry';

describe('frameRegionUnder', () => {
  it('maps a box on a portrait screen into a cropped landscape frame', () => {
    // A 1920×1080 frame covering a 390×844 view: scaled by 844/1080, so
    // 1500 px wide on screen with 555 px cut off each side.
    const region = frameRegionUnder(
      { x: 45, y: 300, width: 300, height: 187.5 },
      { width: 390, height: 844 },
      { width: 1920, height: 1080 },
      0,
    );
    const scale = 844 / 1080;
    const offsetX = (390 - 1920 * scale) / 2;
    expect(region.x).toBeCloseTo((45 - offsetX) / scale, 5);
    expect(region.y).toBeCloseTo(300 / scale, 5);
    expect(region.width).toBeCloseTo(300 / scale, 5);
    expect(region.height).toBeCloseTo(187.5 / scale, 5);
  });

  it('adds the margin and keeps it inside the frame', () => {
    const region = frameRegionUnder(
      { x: 0, y: 0, width: 100, height: 100 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    );
    expect(region).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('is the whole frame when the box covers the view', () => {
    const region = frameRegionUnder(
      { x: 0, y: 0, width: 640, height: 480 },
      { width: 640, height: 480 },
      { width: 640, height: 480 },
      0,
    );
    expect(region).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });
});

describe('lacksAutofocus', () => {
  it('flags a lens that reports only fixed or manual focus', () => {
    expect(lacksAutofocus({ focusMode: ['manual'] })).toBe(true);
    expect(lacksAutofocus({ focusMode: ['none'] })).toBe(true);
  });

  it('trusts a lens with continuous focus, and a browser that does not say', () => {
    expect(lacksAutofocus({ focusMode: ['manual', 'continuous'] })).toBe(false);
    expect(lacksAutofocus({})).toBe(false);
    expect(lacksAutofocus({ focusMode: [] })).toBe(false);
  });
});

describe('scanZoom', () => {
  it('zooms twice where it can, and as far as it can below that', () => {
    expect(scanZoom({ zoom: { min: 1, max: 10 } })).toBe(2);
    expect(scanZoom({ zoom: { min: 1, max: 1.5 } })).toBe(1.5);
  });

  it('leaves zoom alone where there is none to use', () => {
    expect(scanZoom({})).toBeNull();
    expect(scanZoom({ zoom: { min: 1, max: 1 } })).toBeNull();
    expect(scanZoom({ zoom: { min: 2, max: 8 } })).toBeNull();
  });
});

describe('cameraProblem', () => {
  it('says which failure it was', () => {
    expect(cameraProblem({ name: 'NotAllowedError' })).toMatch(/blocked/);
    expect(cameraProblem({ name: 'NotFoundError' })).toMatch(/No camera/);
    expect(cameraProblem({ name: 'NotReadableError' })).toMatch(/Another app/);
    expect(cameraProblem(new Error('x'))).toBe('The camera could not start.');
    expect(cameraProblem(null)).toBe('The camera could not start.');
  });
});
