/**
 * Where the overlay sits on the card, and which parts of it are there at all.
 *
 * Kept away from the drawing so it can be tested: the canvas cannot be, and
 * "the block never leaves the frame" is exactly the sort of rule that is wrong
 * at one edge and right at the other three.
 */

/** The pieces of the card, in the order they are drawn. */
export const CARD_BLOCKS = ['title', 'hero', 'stats', 'lifts', 'climb'] as const;

export type CardBlock = (typeof CARD_BLOCKS)[number];

export type CardBlocks = Record<CardBlock, boolean>;

/** Everything on, which is what the card has always shown. */
export const ALL_BLOCKS: CardBlocks = { title: true, hero: true, stats: true, lifts: true, climb: true };

/**
 * Where the overlay sits, as fractions of the frame rather than pixels: the
 * preview is about three hundred and sixty points wide and the file is a
 * thousand and eighty, and the same numbers have to mean the same thing in
 * both.
 */
export interface Placement {
  /** The centre of the overlay, 0 at the left or top edge, 1 at the right or bottom. */
  x: number;
  y: number;
  /** 1 is the overlay at its natural size. */
  scale: number;
}

/** The middle of the frame, at the size it was drawn. */
export const CENTRED: Placement = { x: 0.5, y: 0.5, scale: 1 };

export const MIN_SCALE = 0.6;
export const MAX_SCALE = 1.4;

export interface Size {
  width: number;
  height: number;
}

const between = (low: number, value: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * The placement, made legal.
 *
 * The overlay stays inside the frame: you can push it flush against an edge and
 * no further, because a card with its own title half off the side is not a
 * thing anyone meant to make. An overlay scaled past the frame — which only
 * happens in one dimension at a time, and only at the top of the scale — has
 * nowhere to go, so it is centred on that axis rather than jittering against
 * two impossible bounds.
 *
 * `overlay` is the size it is drawn at, before `scale`; the scale here is the
 * one being asked for, so that growing a block pinned to an edge pushes it back
 * into the frame rather than over it.
 */
export const clampPlacement = (place: Placement, overlay: Size, frame: Size): Placement => {
  const scale = between(MIN_SCALE, place.scale, MAX_SCALE);
  const axis = (centre: number, length: number, within: number): number => {
    const half = (length * scale) / 2 / within;
    return half >= 0.5 ? 0.5 : between(half, centre, 1 - half);
  };
  return {
    x: axis(place.x, overlay.width, frame.width),
    y: axis(place.y, overlay.height, frame.height),
    scale,
  };
};

/**
 * Where the overlay's top-left corner lands, in the frame's own units, ready to
 * be drawn or to be handed to a transform.
 */
export const placementOrigin = (place: Placement, overlay: Size, frame: Size): { left: number; top: number } => ({
  left: place.x * frame.width - (overlay.width * place.scale) / 2,
  top: place.y * frame.height - (overlay.height * place.scale) / 2,
});
