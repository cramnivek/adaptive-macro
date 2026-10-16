import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'adaptive_card_';
const GCS_BASE_URL = 'https://storage.googleapis.com/adaptive-macro-card-images';

export const sanitizeSessionId = (sessionId: string): string =>
  sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');

export const getPublicCardUrl = (sessionId?: string | null): string | null => {
  if (!sessionId) return null;
  return `${GCS_BASE_URL}/${encodeURIComponent(sanitizeSessionId(sessionId))}.jpg`;
};

/**
 * Saves the customized card locally (instant access for author) and uploads it
 * to GCS via proxy so followers and community feeds can see the exact custom card.
 */
export const persistCustomCard = async (
  sessionId: string,
  cardFile: { file: File; url: string },
): Promise<string | null> => {
  if (!sessionId) return null;
  const safeId = sanitizeSessionId(sessionId);

  // 1. Save locally for instant rendering on author's device
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${STORAGE_PREFIX}${safeId}`, cardFile.url);
    } else {
      await AsyncStorage.setItem(`${STORAGE_PREFIX}${safeId}`, cardFile.url);
    }
  } catch {}

  // 2. Upload to Cloud Run proxy -> GCS for public feed visibility
  try {
    if (cardFile.file) {
      const arrayBuffer = await cardFile.file.arrayBuffer();
      const res = await fetch(`/api/upload-card?sessionId=${encodeURIComponent(safeId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/jpeg',
          'x-session-id': safeId,
        },
        body: arrayBuffer,
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; url: string };
        return data.url;
      }
    }
  } catch {}

  return getPublicCardUrl(safeId);
};

export const getLocalCustomCard = async (sessionId?: string | null): Promise<string | null> => {
  if (!sessionId) return null;
  const safeId = sanitizeSessionId(sessionId);
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(`${STORAGE_PREFIX}${safeId}`);
      if (val) return val;
    }
    return await AsyncStorage.getItem(`${STORAGE_PREFIX}${safeId}`);
  } catch {
    return null;
  }
};
