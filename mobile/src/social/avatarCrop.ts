/**
 * Where a profile photo sits in its square, and the part of the original that
 * that square shows.
 *
 * The photo is drawn so that at zoom 1 its shorter side just fills the square,
 * and is moved by `offset` (in points, from centred). It can never be moved so
 * far that the square shows anything beyond the photo's edge, which is what
 * `clampOffset` enforces. `cropRect` turns the same numbers into the pixel
 * rectangle of the original to cut out, so what is saved is exactly what was
 * on screen.
 */

export interface CropState {
  zoom: number;
  offset: { x: number; y: number };
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Points per source pixel at this zoom, for a square `view` points across. */
const scaleFor = (photo: { width: number; height: number }, view: number, zoom: number) =>
  (view / Math.min(photo.width, photo.height)) * zoom;

/** The photo's drawn size, in points. */
export const drawnSize = (photo: { width: number; height: number }, view: number, zoom: number) => {
  const s = scaleFor(photo, view, zoom);
  return { width: photo.width * s, height: photo.height * s };
};

/** Holds the offset where the photo still covers the whole square. */
export const clampOffset = (
  photo: { width: number; height: number },
  view: number,
  zoom: number,
  offset: { x: number; y: number },
): { x: number; y: number } => {
  const size = drawnSize(photo, view, zoom);
  const maxX = Math.max(0, (size.width - view) / 2);
  const maxY = Math.max(0, (size.height - view) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
};

/** The square of the original, in its own pixels, that the view is showing. */
export const cropRect = (
  photo: { width: number; height: number },
  view: number,
  state: CropState,
): { originX: number; originY: number; width: number; height: number } => {
  const s = scaleFor(photo, view, state.zoom);
  const offset = clampOffset(photo, view, state.zoom, state.offset);
  const side = view / s;
  // Moving the photo right shows more of its left, so the centre seen moves the other way.
  const centreX = photo.width / 2 - offset.x / s;
  const centreY = photo.height / 2 - offset.y / s;
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return {
    originX: Math.round(clamp(centreX - side / 2, photo.width - side)),
    originY: Math.round(clamp(centreY - side / 2, photo.height - side)),
    width: Math.round(side),
    height: Math.round(side),
  };
};
