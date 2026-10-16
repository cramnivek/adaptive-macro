/**
 * A finger on the block: drag to move it, pinch to size it.
 *
 * Shared by the small preview on the finish sheet and the full-screen editor,
 * because the two must agree to the pixel about where the block ended up —
 * they are the same placement shown at two sizes, and a gesture that behaved
 * differently in each would be a bug nobody could describe.
 */

import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';
import { clampPlacement, type Placement, type Size } from '../shareCardPlacement';

interface Block {
  /** The frame the finger moves in: the preview's own points. */
  frame: Size;
  /** The card's units, which is what the block is measured in and what it is clamped against. */
  card: Size;
  place: Placement;
  /** The overlay at its drawn size, or null while it is being drawn. */
  sticker: Size | null;
  onPlace: (place: Placement) => void;
  onDragging: (down: boolean) => void;
}

const spreadOf = (touches: { pageX: number; pageY: number }[]): number =>
  Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);

export const useBlockGesture = ({ frame, card, place, sticker, onPlace, onDragging }: Block) => {
  // The gesture reads from refs rather than from state: a responder is made
  // once and would otherwise be holding the first render's numbers for ever.
  const latest = useRef({ frame, card, place, sticker, onPlace, onDragging });
  latest.current = { frame, card, place, sticker, onPlace, onDragging };
  const start = useRef<{ place: Placement; spread: number } | null>(null);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches ?? [];
          start.current = {
            place: latest.current.place,
            spread: touches.length >= 2 ? spreadOf(touches) : 0,
          };
          latest.current.onDragging(true);
        },
        onPanResponderMove: (event, gesture) => {
          const from = start.current;
          const { frame: now, card: units, sticker: block, onPlace: put } = latest.current;
          if (from === null || block === null) return;
          const touches = event.nativeEvent.touches ?? [];
          // Two fingers size it, one moves it. A pinch that began as a drag
          // keeps the position it had when the second finger landed.
          const next =
            touches.length >= 2 && from.spread > 0
              ? { ...from.place, scale: from.place.scale * (spreadOf(touches) / from.spread) }
              : {
                  ...from.place,
                  x: from.place.x + gesture.dx / now.width,
                  y: from.place.y + gesture.dy / now.height,
                };
          // The finger moved in the preview's points, which is why the deltas
          // are taken against the frame; the block's own size is in the card's,
          // so the clamp is against the card.
          put(clampPlacement(next, block, units));
        },
        onPanResponderEnd: () => {
          start.current = null;
          latest.current.onDragging(false);
        },
      }),
    [],
  );

  /**
   * Put this on the frame. A browser keeps pinch and drag for itself unless
   * something claims them, and a responder is not a claim: without this the
   * first pinch zooms the page instead of the block. React Native Web will not
   * take `touchAction` as a style, so it goes on the node.
   */
  const claim = (node: unknown) => {
    const element = node as HTMLElement | null;
    if (element?.style !== undefined) element.style.touchAction = 'none';
  };

  return { handlers: pan.panHandlers, claim };
};
