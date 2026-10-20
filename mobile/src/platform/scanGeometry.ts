/**
 * The arithmetic behind the browser barcode camera, kept apart from the camera
 * itself so it can be tested without one.
 */

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The part of the camera frame that sits under the on-screen box.
 *
 * The preview fills the screen with `object-fit: cover`, so a landscape frame
 * on a portrait phone is scaled up and its sides are cut off. Decoding the
 * whole frame then reads codes the person cannot see and spends most of each
 * pass on pixels outside the box. This maps the box back into frame pixels,
 * with some room around it, so a barcode half over the edge still reads.
 */
export const frameRegionUnder = (
  box: Rect,
  view: { width: number; height: number },
  frame: { width: number; height: number },
  margin = 0.15,
): Rect => {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  // Where the scaled frame starts; negative on the side that is cut off.
  const offsetX = (view.width - frame.width * scale) / 2;
  const offsetY = (view.height - frame.height * scale) / 2;

  const padX = box.width * margin;
  const padY = box.height * margin;
  const left = Math.max(0, (box.x - padX - offsetX) / scale);
  const top = Math.max(0, (box.y - padY - offsetY) / scale);
  const right = Math.min(frame.width, (box.x + box.width + padX - offsetX) / scale);
  const bottom = Math.min(frame.height, (box.y + box.height + padY - offsetY) / scale);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

/** The parts of `MediaTrackCapabilities` this uses, which TypeScript's DOM types do not all list. */
export type LensCapabilities = {
  focusMode?: string[];
  zoom?: { min: number; max: number };
};

/**
 * Whether this lens says it cannot focus by itself. Several Android phones
 * hand the browser a fixed-focus wide lens for "the back camera", and a
 * barcode a hand's length away is then blurred for good. A browser that does
 * not report focus modes at all (Safari) is taken at its word, since there is
 * nothing to judge it by.
 */
export const lacksAutofocus = (caps: LensCapabilities): boolean =>
  Array.isArray(caps.focusMode) && caps.focusMode.length > 0 && !caps.focusMode.includes('continuous');

/**
 * The zoom to scan at, or null to leave it alone.
 *
 * Phone lenses cannot focus much closer than ten to twenty centimetres, but at
 * that distance a barcode is small in an unzoomed frame, so people move the
 * phone closer and lose focus. Twice the zoom lets the code fill the box from
 * where the lens can still focus. Only where the browser offers zoom at all.
 */
export const scanZoom = (caps: LensCapabilities, target = 2): number | null => {
  const zoom = caps.zoom;
  if (!zoom || !(zoom.max > zoom.min)) return null;
  const chosen = Math.min(target, zoom.max);
  return chosen > zoom.min ? chosen : null;
};

/** One sentence for each way the camera can fail to start. */
export const cameraProblem = (error: unknown): string => {
  const name = (error as { name?: string } | null)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked. Allow it for this site in your browser settings.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Another app is using the camera. Close it and try again.';
    default:
      return 'The camera could not start.';
  }
};
