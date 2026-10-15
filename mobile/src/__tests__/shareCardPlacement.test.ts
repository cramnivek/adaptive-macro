import { describe, expect, it } from 'vitest';
import {
  ALL_BLOCKS,
  CARD_BLOCKS,
  CENTRED,
  clampPlacement,
  MAX_SCALE,
  MIN_SCALE,
  placementOrigin,
} from '../shareCardPlacement';

const frame = { width: 1080, height: 1920 };
/** A sticker about a third of the frame across and a fifth of it down. */
const overlay = { width: 360, height: 400 };

describe('clampPlacement', () => {
  it('leaves a placement in the middle of the frame alone', () => {
    expect(clampPlacement(CENTRED, overlay, frame)).toEqual(CENTRED);
  });

  it('stops the overlay before it crosses an edge, on all four', () => {
    const left = clampPlacement({ ...CENTRED, x: 0 }, overlay, frame);
    const right = clampPlacement({ ...CENTRED, x: 1 }, overlay, frame);
    const top = clampPlacement({ ...CENTRED, y: 0 }, overlay, frame);
    const bottom = clampPlacement({ ...CENTRED, y: 1 }, overlay, frame);
    // Half the overlay's width is a sixth of the frame; its height, a ninth.
    expect(left.x).toBeCloseTo(360 / 2 / 1080);
    expect(right.x).toBeCloseTo(1 - 360 / 2 / 1080);
    expect(top.y).toBeCloseTo(400 / 2 / 1920);
    expect(bottom.y).toBeCloseTo(1 - 400 / 2 / 1920);
  });

  it('puts the overlay flush with an edge and not beyond it', () => {
    const flush = clampPlacement({ ...CENTRED, x: -5, y: 9 }, overlay, frame);
    const { left, top } = placementOrigin(flush, overlay, frame);
    expect(left).toBeCloseTo(0);
    expect(top).toBeCloseTo(frame.height - overlay.height);
  });

  it('keeps the scale within the limits', () => {
    expect(clampPlacement({ ...CENTRED, scale: 9 }, overlay, frame).scale).toBe(MAX_SCALE);
    expect(clampPlacement({ ...CENTRED, scale: 0 }, overlay, frame).scale).toBe(MIN_SCALE);
  });

  it('accounts for the scale being asked for, so growing against an edge pushes back in', () => {
    const pinned = clampPlacement({ x: 1, y: 0.5, scale: 1 }, overlay, frame);
    const grown = clampPlacement({ ...pinned, scale: MAX_SCALE }, overlay, frame);
    expect(grown.x).toBeLessThan(pinned.x);
    expect(placementOrigin(grown, overlay, frame).left + overlay.width * MAX_SCALE).toBeCloseTo(frame.width);
  });

  it('centres an overlay too big for the frame rather than fighting two bounds', () => {
    const huge = { width: 1600, height: 400 };
    expect(clampPlacement({ ...CENTRED, x: 0.1 }, huge, frame).x).toBe(0.5);
    // The other axis still fits, and is still free.
    expect(clampPlacement({ ...CENTRED, y: 0.2 }, huge, frame).y).toBeCloseTo(0.2);
  });
});

describe('placementOrigin', () => {
  it('puts a centred overlay where its middle meets the frame’s middle', () => {
    expect(placementOrigin(CENTRED, overlay, frame)).toEqual({ left: 1080 / 2 - 180, top: 1920 / 2 - 200 });
  });

  it('scales about the centre, so growing does not shove it sideways', () => {
    const grown = placementOrigin({ ...CENTRED, scale: 1.4 }, overlay, frame);
    expect(grown.left).toBeCloseTo(540 - (360 * 1.4) / 2);
    expect(grown.top).toBeCloseTo(960 - (400 * 1.4) / 2);
  });
});

describe('the blocks', () => {
  it('are drawn in the order the card reads', () => {
    expect([...CARD_BLOCKS]).toEqual(['title', 'hero', 'stats', 'lifts', 'climb']);
  });

  it('are all on to begin with, which is the card as it was', () => {
    expect(CARD_BLOCKS.every((block) => ALL_BLOCKS[block])).toBe(true);
  });
});
