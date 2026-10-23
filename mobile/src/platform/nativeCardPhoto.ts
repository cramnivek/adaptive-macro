import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** A bounded JPEG crosses the DOM bridge; the original camera-roll image stays in the picker. */
export const pickNativeCardPhoto = async (): Promise<string | null> => {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (picked.canceled || !picked.assets.length) return null;
  const source = ImageManipulator.manipulate(picked.assets[0].uri);
  let loaded: Awaited<ReturnType<typeof source.renderAsync>> | undefined;
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let rendered: typeof loaded;
  try {
    loaded = await source.renderAsync();
    context = ImageManipulator.manipulate(loaded);
    if (Math.max(loaded.width, loaded.height) > 1920) {
      context.resize(loaded.width >= loaded.height ? { width: 1920 } : { height: 1920 });
    }
    rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
    if (!result.base64) throw new Error('That photo could not be opened.');
    return `data:image/jpeg;base64,${result.base64}`;
  } finally {
    rendered?.release();
    context?.release();
    loaded?.release();
    source.release();
  }
};
