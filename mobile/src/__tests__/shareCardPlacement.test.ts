import { describe, expect, it } from 'vitest';
import {
  ALL_BLOCKS,
  CARD_BLOCKS,
  clampPlacement,
  MAX_SCALE,
  MIN_SCALE,
  placementOrigin,
} from '../shareCardPlacement';

const frame = { width: 1080, height: 1920 };
/** The middle of the frame, at the size it was drawn: what the rules bend away from. */
const CENTRED = { x: 0.5, y: 0.5, scale: 1 };
/** A sticker about a third of the frame across and a fifth of it down. */
const overlay = { width: 360, height: 400 };

describe('clampPlacement', () => {
  it('leaves a placement in the middle of the frame alone', () => {
    expect(clampPlacement(CENTRED, overlay, frame)).toEqual(CENTRED);
  });

  it('lets the overlay hang off an edge, keeping a third of it on the card', () => {
    const pushed = clampPlacement({ ...CENTRED, x: -5, y: 9 }, overlay, frame);
    const { left, top } = placementOrigin(pushed, overlay, frame);
    // Two thirds of it are off the left, and two thirds off the bottom.
    expect(left + overlay.width).toBeCloseTo(overlay.width / 3);
    expect(top).toBeCloseTo(frame.height - overlay.height / 3);
  });

  it('holds the same third on the opposite edges', () => {
    const right = clampPlacement({ ...CENTRED, x: 9 }, overlay, frame);
    const top = clampPlacement({ ...CENTRED, y: -9 }, overlay, frame);
    expect(placementOrigin(right, overlay, frame).left).toBeCloseTo(frame.width - overlay.width / 3);
    expect(placementOrigin(top, overlay, frame).top + overlay.height).toBeCloseTo(overlay.height / 3);
  });

  it('keeps the scale within the limits', () => {
    expect(clampPlacement({ ...CENTRED, scale: 9 }, overlay, frame).scale).toBe(MAX_SCALE);
    expect(clampPlacement({ ...CENTRED, scale: 0 }, overlay, frame).scale).toBe(MIN_SCALE);
  });

  it('measures the third against the scale being asked for, so shrinking at an edge pulls it back', () => {
    const pinned = clampPlacement({ x: 9, y: 0.5, scale: 1 }, overlay, frame);
    const shrunk = clampPlacement({ ...pinned, scale: MIN_SCALE }, overlay, frame);
    // Left where it was, a block made smaller at the edge would have slid out
    // from under itself until there was nothing to take hold of.
    expect(shrunk.x).toBeLessThan(pinned.x);
    expect(placementOrigin(shrunk, overlay, frame).left).toBeCloseTo(
      frame.width - (overlay.width * MIN_SCALE) / 3,
    );
  });

  it('leaves an overlay wider than the frame somewhere to go', () => {
    const huge = { width: 1600, height: 400 };
    const pushed = clampPlacement({ ...CENTRED, x: -9 }, huge, frame);
    // A third of the frame rather than a third of the block: a third of this
    // one is wider than the card, and the block would be stuck.
    expect(placementOrigin(pushed, huge, frame).left + huge.width).toBeCloseTo(frame.width / 3);
    expect(pushed.x).toBeLessThan(CENTRED.x);
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
