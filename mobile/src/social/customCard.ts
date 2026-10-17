import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentAccessToken } from './api';

const STORAGE_PREFIX = 'adaptive_card_img_';
const STATUS_PREFIX = 'adaptive_card_status_';
const GCS_BASE_URL = 'https://storage.googleapis.com/adaptive-macro-card-images';

export interface CardSyncStatus {
  sessionId: string;
  status: 'synced' | 'failed' | 'pending';
  cloudUrl?: string;
  error?: string;
  updatedAt: number;
}

export const sanitizeSessionId = (sessionId: string): string =>
  sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');

export const getPublicCardUrl = (sessionId?: string | null, authorId?: string | null): string | null => {
  if (!sessionId) return null;
  const safeId = sanitizeSessionId(sessionId);
  if (authorId) {
    return `${GCS_BASE_URL}/${encodeURIComponent(authorId)}/${encodeURIComponent(safeId)}.jpg`;
  }
  return `${GCS_BASE_URL}/${encodeURIComponent(safeId)}.jpg`;
};

/** Convert File or Blob to durable base64 DataURL so it persists across tab closes */
export const fileToDataUrl = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      return reject(new Error('FileReader not available'));
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to DataURL'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
};

/** Convert base64 data URL to ArrayBuffer for uploading */
export const dataUrlToArrayBuffer = (dataUrl: string): ArrayBuffer => {
  const base64 = dataUrl.split(',')[1] ?? dataUrl;
  const binaryString = typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const storeItem = async (key: string, value: string): Promise<void> => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  } catch {}
};

const getItem = async (key: string): Promise<string | null> => {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(key);
      if (val) return val;
    }
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Saves the customized card locally as a durable data URL (permanent on author's device)
 * and uploads it to Cloud Run -> GCS.
 *
 * If upload succeeds, records status 'synced' and returns confirmed public URL.
 * If upload fails, preserves local image, records status 'failed', and returns null (never a fake 404 URL).
 */
export const persistCustomCard = async (
  sessionId: string,
  cardFile: { file?: File | Blob | null; url: string; dataUrl?: string },
): Promise<string | null> => {
  if (!sessionId) return null;
  const safeId = sanitizeSessionId(sessionId);

  // 1. Create and store durable base64 DataURL (NOT temporary blob URL)
  let durableDataUrl: string | null = cardFile.dataUrl ?? null;
  if (!durableDataUrl && cardFile.file) {
    try {
      durableDataUrl = await fileToDataUrl(cardFile.file);
    } catch {
      // Fallback: if dataURL generation fails, keep whatever URL was provided
      durableDataUrl = cardFile.url;
    }
  } else if (!durableDataUrl) {
    durableDataUrl = cardFile.url;
  }

  if (durableDataUrl) {
    await storeItem(`${STORAGE_PREFIX}${safeId}`, durableDataUrl);
  }

  // Record pending upload
  await storeItem(
    `${STATUS_PREFIX}${safeId}`,
    JSON.stringify({
      sessionId: safeId,
      status: 'pending',
      updatedAt: Date.now(),
    } satisfies CardSyncStatus),
  );

  // 2. Upload to Cloud Run proxy -> GCS
  try {
    let arrayBuffer: ArrayBuffer | null = null;
    if (cardFile.file) {
      arrayBuffer = await cardFile.file.arrayBuffer();
    } else if (durableDataUrl && durableDataUrl.startsWith('data:')) {
      arrayBuffer = dataUrlToArrayBuffer(durableDataUrl);
    }

    if (arrayBuffer && arrayBuffer.byteLength > 0) {
      const token = await currentAccessToken();
      const proxyToken = process.env.EXPO_PUBLIC_PROXY_TOKEN;
      const headers: Record<string, string> = {
        'Content-Type': 'image/jpeg',
        'x-session-id': safeId,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (proxyToken) headers['x-proxy-token'] = proxyToken;

      const res = await fetch(`/api/upload-card?sessionId=${encodeURIComponent(safeId)}`, {
        method: 'POST',
        headers,
        body: arrayBuffer,
      });

      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; url: string };
        if (data.ok && data.url) {
          // Success: save confirmed status
          await storeItem(
            `${STATUS_PREFIX}${safeId}`,
            JSON.stringify({
              sessionId: safeId,
              status: 'synced',
              cloudUrl: data.url,
              updatedAt: Date.now(),
            } satisfies CardSyncStatus),
          );
          return data.url;
        }
      }
    }
  } catch (err) {
    // Record failure
    await storeItem(
      `${STATUS_PREFIX}${safeId}`,
      JSON.stringify({
        sessionId: safeId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Network error',
        updatedAt: Date.now(),
      } satisfies CardSyncStatus),
    );
    return null;
  }

  // If upload failed, record failed status and return null (never a speculative 404 URL)
  await storeItem(
    `${STATUS_PREFIX}${safeId}`,
    JSON.stringify({
      sessionId: safeId,
      status: 'failed',
      error: 'Upload failed',
      updatedAt: Date.now(),
    } satisfies CardSyncStatus),
  );
  return null;
};

/** Get the persistent local image (durable data URL or confirmed cloud URL) */
export const getLocalCustomCard = async (sessionId?: string | null): Promise<string | null> => {
  if (!sessionId) return null;
  const safeId = sanitizeSessionId(sessionId);
  // Check new durable storage prefix first
  const durable = await getItem(`${STORAGE_PREFIX}${safeId}`);
  if (durable && (durable.startsWith('data:') || durable.startsWith('http'))) {
    return durable;
  }
  // Check legacy prefix (adaptive_card_)
  const legacy = await getItem(`adaptive_card_${safeId}`);
  if (legacy && (legacy.startsWith('data:') || legacy.startsWith('http'))) {
    return legacy;
  }
  return null;
};

/** Get card upload synchronization status */
export const getCustomCardStatus = async (sessionId?: string | null): Promise<CardSyncStatus | null> => {
  if (!sessionId) return null;
  const safeId = sanitizeSessionId(sessionId);
  const raw = await getItem(`${STATUS_PREFIX}${safeId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CardSyncStatus;
  } catch {
    return null;
  }
};

/** Retry failed card upload using cached durable image */
export const retryCustomCardUpload = async (sessionId: string): Promise<string | null> => {
  const localImage = await getLocalCustomCard(sessionId);
  if (!localImage) return null;

  const safeId = sanitizeSessionId(sessionId);
  try {
    let arrayBuffer: ArrayBuffer;
    if (localImage.startsWith('data:')) {
      arrayBuffer = dataUrlToArrayBuffer(localImage);
    } else {
      const resp = await fetch(localImage);
      arrayBuffer = await resp.arrayBuffer();
    }

    const token = await currentAccessToken();
    const proxyToken = process.env.EXPO_PUBLIC_PROXY_TOKEN;
    const headers: Record<string, string> = {
      'Content-Type': 'image/jpeg',
      'x-session-id': safeId,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (proxyToken) headers['x-proxy-token'] = proxyToken;

    const res = await fetch(`/api/upload-card?sessionId=${encodeURIComponent(safeId)}`, {
      method: 'POST',
      headers,
      body: arrayBuffer,
    });

    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; url: string };
      if (data.ok && data.url) {
        await storeItem(
          `${STATUS_PREFIX}${safeId}`,
          JSON.stringify({
            sessionId: safeId,
            status: 'synced',
            cloudUrl: data.url,
            updatedAt: Date.now(),
          } satisfies CardSyncStatus),
        );
        return data.url;
      }
    }
  } catch (err) {
    await storeItem(
      `${STATUS_PREFIX}${safeId}`,
      JSON.stringify({
        sessionId: safeId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Network error',
        updatedAt: Date.now(),
      } satisfies CardSyncStatus),
    );
  }
  return null;
};
