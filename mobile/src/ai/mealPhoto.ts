import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { MealPhoto } from './describeMeal';

/**
 * Taking a photo of a meal, and getting it small enough to send.
 *
 * Native modules, so nothing here can be tested under `environment: 'node'` —
 * this file is verified in a browser against the staged build. The part worth
 * testing, what actually goes in the request, lives in `mealRequest.ts`.
 */

/**
 * Long enough to tell rice from couscous, small enough not to be billed for pixels.
 *
 * Gemini charges for an image by tiling it, so a twelve-megapixel photo costs
 * several times what this does and tells the model nothing extra: identifying
 * the food and judging the portion against the plate is plate-level work.
 */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.7;

/**
 * Shrinks and re-encodes any image URI, returning clean base64.
 *
 * Takes a URI rather than bytes because that is the one thing every source
 * agrees on. A picker hands back a file path on native and a data URL on web;
 * `CameraView` hands back a data URL in *both* `uri` and `base64` on web while
 * native puts raw base64 in `base64` and a path in `uri`. Going through the URI
 * and letting the manipulator produce the base64 makes that difference stop
 * mattering — read `base64` straight off a web capture and a `data:` prefix
 * ends up inside the request.
 *
 * The dimensions come from the loaded image rather than the caller, because the
 * caller's are not reliable: web capture reports the media track's settings,
 * which can be zero.
 *
 * The longest edge is what gets constrained. Resizing a 3000x4000 portrait by
 * width alone leaves it 1024x1365 — over the budget, and billed for it.
 */
export const preparePhoto = async (uri: string): Promise<MealPhoto> => {
  const loaded = await ImageManipulator.manipulate(uri).renderAsync();

  const context = ImageManipulator.manipulate(loaded);
  context.resize(loaded.width >= loaded.height ? { width: MAX_EDGE } : { height: MAX_EDGE });

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });

  if (!result.base64) {
    throw new Error('Could not read that photo. Try taking it again.');
  }
  return { base64: result.base64, mimeType: 'image/jpeg' };
};

/** `null` when the user backs out, which is not an error. */
const firstAsset = async (result: ImagePicker.ImagePickerResult): Promise<MealPhoto | null> => {
  if (result.canceled || result.assets.length === 0) return null;
  return preparePhoto(result.assets[0].uri);
};

/**
 * `quality: 1` at the picker and the real compression in `preparePhoto`:
 * compressing twice loses detail for nothing, since the second pass re-encodes
 * the first one's artefacts.
 *
 * There is no camera counterpart here any more. Taking a photo goes through
 * `MealCameraSheet`, which drives `CameraView` itself so the camera can stay
 * open for a retake — the OS camera closes after one shot and cannot.
 */
export const chooseMealPhoto = async (): Promise<MealPhoto | null> =>
  firstAsset(await ImagePicker.launchImageLibraryAsync({ quality: 1 }));
