/**
 * Cutting the person out of the photograph, so the type can pass behind them.
 *
 * That is the whole of the depth effect: not a filter, an order. A headline
 * that runs behind someone's shoulder reads as a place rather than a sticker,
 * and nothing else about the card has to change for it.
 *
 * It costs something real and the cost is why it is a choice and not the
 * default: the runtime that does the segmenting is about nine and a half
 * megabytes. It is fetched from a public CDN the first time someone asks for
 * depth, and cached by the browser after that. **The photograph never leaves
 * the phone** — only the runtime and a quarter-megabyte model come down.
 */

/** Pinned: a version that moves under us would be a 9 MB surprise, not an upgrade. */
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

type Segmenter = {
  segment: (image: HTMLImageElement | HTMLCanvasElement, done: (result: SegmentResult) => void) => void;
};

interface SegmentResult {
  categoryMask?: { getAsUint8Array: () => Uint8Array; width: number; height: number; close: () => void };
  close?: () => void;
}

/** Loaded once per page: the model is the expensive part and it does not change. */
let loading: Promise<Segmenter> | null = null;

const segmenter = (): Promise<Segmenter> => {
  loading ??= (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const files = await vision.FilesetResolver.forVisionTasks(WASM);
    return (await vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    })) as unknown as Segmenter;
  })();
  return loading;
};

/**
 * Where a photograph lands when it fills a frame without being stretched.
 *
 * Shared with the backdrop on purpose: the cut-out is laid over the graded
 * photograph and the two have to agree about the geometry to the pixel, or the
 * person appears beside themselves.
 */
export const coverRect = (
  photo: { naturalWidth: number; naturalHeight: number },
  frame: { width: number; height: number },
): { x: number; y: number; width: number; height: number } => {
  const scale = Math.max(frame.width / photo.naturalWidth, frame.height / photo.naturalHeight);
  const width = photo.naturalWidth * scale;
  const height = photo.naturalHeight * scale;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
};

/**
 * The person, on nothing, at the size and position the card draws the photo.
 *
 * Null when there is nothing it can recognise as a person, or when the runtime
 * cannot be had at all — on a plane, behind a firewall, on a browser without
 * the WebAssembly it needs. The card is perfectly good without this, so a
 * failure here is a card without depth rather than no card.
 */
export const subjectOf = async (
  photo: HTMLImageElement,
  frame: { width: number; height: number },
): Promise<HTMLCanvasElement | null> => {
  if (typeof document === 'undefined') return null;
  const model = await segmenter();
  const result = await new Promise<SegmentResult>((resolve) => model.segment(photo, resolve));
  const mask = result.categoryMask;
  if (mask === undefined) {
    result.close?.();
    return null;
  }

  const pixels = mask.getAsUint8Array();
  // The model answers 0 for background and 1 for the person. A photograph of a
  // barbell and a wall comes back all background, and a card that cuts out
  // nothing is a card with a hole in it, so that case gives up instead.
  let person = 0;
  for (let i = 0; i < pixels.length; i += 1) if (pixels[i] !== 0) person += 1;
  const share = person / pixels.length;

  let cut: HTMLCanvasElement | null = null;
  if (share > 0.02) {
    const stencil = document.createElement('canvas');
    stencil.width = mask.width;
    stencil.height = mask.height;
    const into = stencil.getContext('2d') as CanvasRenderingContext2D;
    const image = into.createImageData(mask.width, mask.height);
    for (let i = 0; i < pixels.length; i += 1) image.data[i * 4 + 3] = pixels[i] === 0 ? 0 : 255;
    into.putImageData(image, 0, 0);

    cut = document.createElement('canvas');
    cut.width = frame.width;
    cut.height = frame.height;
    const ctx = cut.getContext('2d') as CanvasRenderingContext2D;
    const rect = coverRect(photo, frame);
    ctx.drawImage(photo, rect.x, rect.y, rect.width, rect.height);
    // The mask is two hundred and fifty-six pixels square and the card is a
    // thousand wide, so its edge arrives as a staircase. A blur on the way in
    // turns that into an edge a person reads as an edge.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.filter = 'blur(3px)';
    ctx.drawImage(stencil, rect.x, rect.y, rect.width, rect.height);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
  }

  mask.close();
  result.close?.();
  return cut;
};
