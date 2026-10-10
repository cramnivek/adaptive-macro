import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Reading and writing files, on whichever platform this is.
 *
 * `expo-file-system` does not exist on web: both `readAsStringAsync` and
 * `writeAsStringAsync` throw "not available on web". That broke the Hevy
 * import and the data export silently — each caught the error and showed a
 * dismissible alert, on the one platform where the data is least durable.
 *
 * Centralised because getting it wrong is invisible until someone tries it on
 * a phone browser, which is exactly where this app is used.
 */

/** Text of a file the user picked, or null when they cancelled. */
export const pickTextFile = async (): Promise<{ name: string; text: string } | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    // Unfiltered on purpose: a list of media types leaves iOS Safari offering
    // only Photo Library and Take Photo, with no way to reach the Files app.
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const text = await readAsset(asset);
  return { name: asset.name ?? 'file', text };
};

/**
 * A file the user picked, to be sent as bytes rather than read as text.
 *
 * The contents are read only on `readBase64`, so a file too large to send can
 * be turned away on its size without first being held in memory as base64.
 */
export const pickBinaryFile = async (): Promise<{
  name: string;
  mimeType: string;
  size: number | null;
  readBase64: () => Promise<string>;
} | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    // Unfiltered, for the same iOS Safari reason as `pickTextFile`.
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  return {
    name: asset.name ?? 'file',
    mimeType: asset.mimeType ?? asset.file?.type ?? '',
    size: asset.size ?? asset.file?.size ?? null,
    readBase64: async () => {
      if (Platform.OS !== 'web') {
        return FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      }
      const blob: Blob = asset.file ? asset.file : await (await fetch(asset.uri)).blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      // A data URL is "data:<type>;base64,<data>"; only the data is wanted.
      return dataUrl.slice(dataUrl.indexOf(',') + 1);
    },
  };
};

export const readAsset = async (
  asset: DocumentPicker.DocumentPickerAsset,
): Promise<string> => {
  // On web the picker hands back a real File, and its blob URI is readable
  // through fetch; on a device there is no File and only expo-file-system can
  // open the URI.
  if (asset.file) return asset.file.text();
  if (Platform.OS === 'web') return fetch(asset.uri).then((response) => response.text());
  return FileSystem.readAsStringAsync(asset.uri);
};

/**
 * Hands the user a text file to keep.
 *
 * On web that means a download, which is the only way a browser can give
 * someone a file. On a device it is a share sheet, so the file can go to
 * Files, a cloud drive or a message.
 */
export const saveTextFile = async (
  filename: string,
  text: string,
  mimeType = 'application/json',
): Promise<'downloaded' | 'shared' | 'written'> => {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoked on a later tick: revoking immediately can cancel the download in
    // some browsers before it has started reading the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  }

  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, text);

  if (!(await Sharing.isAvailableAsync())) return 'written';
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: filename });
  return 'shared';
};
