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

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2.2;

/**
 * How much of the block has to stay on the card: a third of it, on each axis.
 *
 * The first version kept the whole block inside the frame, and it felt like a
 * box rather than a card — type running off an edge is how these are made, and
 * every attempt to do it hit a wall. A third is enough that the block can never
 * be pushed somewhere it cannot be found again.
 */
const KEEP = 1 / 3;

export interface Size {
  width: number;
  height: number;
}

const between = (low: number, value: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * The placement, made legal.
 *
 * The block may hang off any edge, as long as a third of it is still on the
 * card. A block bigger than the frame keeps a third of the frame instead —
 * otherwise a figure blown up past the width could not be moved at all, which
 * is the thing this rule exists to prevent.
 *
 * `overlay` is the size it is drawn at, before `scale`; the scale here is the
 * one being asked for, so that growing a block against an edge pushes it back
 * rather than letting it slide out from under itself.
 */
export const clampPlacement = (place: Placement, overlay: Size, frame: Size): Placement => {
  const scale = between(MIN_SCALE, place.scale, MAX_SCALE);
  const axis = (centre: number, length: number, within: number): number => {
    const size = length * scale;
    // The bounds are symmetric: as far off the left as off the right.
    const edge = (KEEP * Math.min(size, within) - size / 2) / within;
    return between(edge, centre, 1 - edge);
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
