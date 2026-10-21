import { describe, expect, it } from 'vitest';
import { clampOffset, cropRect } from '../social/avatarCrop';

const LANDSCAPE = { width: 4000, height: 3000 };
const VIEW = 300;

describe('avatar crop', () => {
  it('takes the centred square of the short side at zoom 1', () => {
    expect(cropRect(LANDSCAPE, VIEW, { zoom: 1, offset: { x: 0, y: 0 } })).toEqual({
      originX: 500,
      originY: 0,
      width: 3000,
      height: 3000,
    });
  });

  it('shows the left of the photo when it is dragged right, and stops at the edge', () => {
    // Drawn 400 x 300, so it can move 50 points either way.
    expect(clampOffset(LANDSCAPE, VIEW, 1, { x: 200, y: 40 })).toEqual({ x: 50, y: 0 });
    expect(cropRect(LANDSCAPE, VIEW, { zoom: 1, offset: { x: 200, y: 0 } }).originX).toBe(0);
  });

  it('cuts a smaller square when zoomed in, around where it was moved', () => {
    const rect = cropRect(LANDSCAPE, VIEW, { zoom: 2, offset: { x: 0, y: -150 } });
    expect(rect.width).toBe(1500);
    // Dragged up by half the square: the lower half of the photo.
    expect(rect.originY).toBe(1500);
  });
});
