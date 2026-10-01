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
 * Shrinks and re-encodes, returning base64.
 *
 * base64 rather than a file path because the web build has no filesystem: on
 * web the camera hands back base64 already, and one representation that behaves
 * the same on both runtimes is worth more than the bytes it costs.
 *
 * The longest edge is what gets constrained. Resizing a 3000x4000 portrait by
 * width alone leaves it 1024x1365 — over the budget, and billed for it.
 */
const prepare = async (uri: string, width: number, height: number): Promise<MealPhoto> => {
  const context = ImageManipulator.manipulate(uri);
  context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });

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
  const asset = result.assets[0];
  return prepare(asset.uri, asset.width, asset.height);
};

/**
 * `quality: 1` here and the real compression in `prepare`: compressing twice
 * loses detail for nothing, since the second pass re-encodes the first one's
 * artefacts.
 */
export const takeMealPhoto = async (): Promise<MealPhoto | null> => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access is off for this app. You can still describe the meal.');
  }
  return firstAsset(await ImagePicker.launchCameraAsync({ quality: 1 }));
};

export const chooseMealPhoto = async (): Promise<MealPhoto | null> =>
  firstAsset(await ImagePicker.launchImageLibraryAsync({ quality: 1 }));
