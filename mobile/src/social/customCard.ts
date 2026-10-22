import AsyncStorage from '@react-native-async-storage/async-storage';
import { proxyBase } from '../api/gemini';
import { currentAccessToken } from './api';

const STORAGE_PREFIX = 'adaptive_card_img_';
const STATUS_PREFIX = 'adaptive_card_status_';

export interface CardSyncStatus {
  sessionId: string;
  status: 'synced' | 'failed' | 'pending' | 'local_only';
  cloudUrl?: string;
  error?: string;
  updatedAt: number;
}

export const sanitizeSessionId = (sessionId: string): string =>
  sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');

/**
 * Where a post's card image is asked for: this app's own server, which answers
 * only if the viewer may see the post (services/gemini-proxy/src/cardImages.ts).
 * The bucket behind it is private; its addresses were public before, and the
 * rules about who sees a post did not reach the picture.
 *
 * Null without the author, since images are filed in their author's folder.
 * Cards uploaded before that, loose at the top of the bucket, are no longer
 * served, and those posts show their card drawn from the workout instead.
 */
export const cardImagePath = (sessionId?: string | null, authorId?: string | null): string | null => {
  if (!sessionId || !authorId) return null;
  // Through proxyBase: empty in a browser, where the app and its server share an
  // origin, and the server's own address in the native app, where a bare
  // "/api/..." has nowhere to go and every card image silently failed.
  return `${proxyBase()}/api/card?author=${encodeURIComponent(authorId)}&session=${encodeURIComponent(sanitizeSessionId(sessionId))}`;
};

/**
 * An image the screen can show from a fetched blob: an object URL in a browser,
 * and a data URL in the native app, which has no object URLs. Only the former
 * needs revoking, which `releaseImage` does.
 */
const showableImage = async (blob: Blob): Promise<string> => {
  if (typeof URL.createObjectURL === 'function' && typeof document !== 'undefined') return URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

/** Lets go of an image from `fetchCardImage`; nothing to do for a data URL. */
export const releaseImage = (url: string): void => {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
};

/**
 * A post's card image as a local object URL, or null when there is none to
 * show: signed out, not allowed, never uploaded, or unreachable. An <img> tag
 * cannot send the viewer's sign-in, so the image is fetched with it and handed
 * over as a blob; the caller revokes the URL when it is done with it.
 */
export const fetchCardImage = async (sessionId?: string | null, authorId?: string | null): Promise<string | null> => {
  const path = cardImagePath(sessionId, authorId);
  if (!path) return null;
  const token = await currentAccessToken();
  if (!token) return null;
  try {
    // cardImagePath already carries the proxy's address on a phone.
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await showableImage(await res.blob());
  } catch {
    return null;
  }
};

/**
 * Removes the signed-in person's card for one session from the server. Best
 * effort: a post deleted while this fails leaves an image nobody can be served,
 * since the post it would be checked against is gone.
 */
export const removeCardImage = async (sessionId: string): Promise<boolean> => {
  const token = await currentAccessToken();
  if (!token) return false;
  try {
    const res = await fetch(`${proxyBase()}/api/card?session=${encodeURIComponent(sanitizeSessionId(sessionId))}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
};

/** Removes every card the signed-in person has on the server; used before the account is deleted. */
export const removeAllCardImages = async (): Promise<boolean> => {
  const token = await currentAccessToken();
  if (!token) return false;
  try {
    const res = await fetch(`${proxyBase()}/api/cards`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
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

/**
 * Resolves a card file/URL into a durable data URL.
 * NEVER returns a temporary blob: URL. If conversion fails, returns null.
 */
export const resolveDurableDataUrl = async (
  cardFile: { file?: File | Blob | null; url?: string | null; dataUrl?: string | null },
): Promise<string | null> => {
  if (cardFile.dataUrl && cardFile.dataUrl.startsWith('data:')) {
    return cardFile.dataUrl;
  }
  if (cardFile.file) {
    try {
      return await fileToDataUrl(cardFile.file);
    } catch {
      return null;
    }
  }
  if (cardFile.url) {
    if (cardFile.url.startsWith('data:') || cardFile.url.startsWith('http')) {
      return cardFile.url;
    }
    if (cardFile.url.startsWith('blob:') && typeof fetch !== 'undefined') {
      try {
        const resp = await fetch(cardFile.url);
        const blob = await resp.blob();
        return await fileToDataUrl(blob);
      } catch {
        return null;
      }
    }
  }
  return null;
};

/* ---------------------------------------------------------------------------
 * Durable Media Storage:
 * - Web: IndexedDB ('ascend_media' / 'card_images') gives hundreds of MBs of
 *   reliable quota, avoiding localStorage 5MB quota exhaustion.
 * - Native: FileSystem.documentDirectory ('ascend_cards/') persists across
 *   app updates and reboots.
 * - Key-value metadata & sync status are preserved in AsyncStorage / localStorage.
 * ------------------------------------------------------------------------ */

const IDB_NAME = 'ascend_media';
const IDB_STORE = 'card_images';
const IDB_VERSION = 1;

let idbPromise: Promise<IDBDatabase | null> | null = null;

const getIndexedDb = (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!idbPromise) {
    idbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return idbPromise;
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

const getFileSystem = async () => {
  if (typeof navigator !== 'undefined' && (navigator as { product?: string }).product === 'ReactNative') {
    try {
      return await import('expo-file-system/legacy');
    } catch {
      return null;
    }
  }
  return null;
};

/** Save a card image permanently into durable media storage */
export const putDurableImage = async (key: string, dataUrl: string): Promise<void> => {
  // 1. IndexedDB on Web
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await getIndexedDb();
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const store = tx.objectStore(IDB_STORE);
          const req = store.put(dataUrl, key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
        return;
      }
    } catch {
      // Fall through to key-value storage if IDB fails
    }
  }

  // 2. Native FileSystem in documentDirectory
  const fs = await getFileSystem();
  if (fs && fs.documentDirectory) {
    try {
      const dir = `${fs.documentDirectory}ascend_cards/`;
      const dirInfo = await fs.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await fs.makeDirectoryAsync(dir, { intermediates: true });
      }
      const target = `${dir}${key}.jpg`;
      const base64Data = dataUrl.split(',')[1] ?? dataUrl;
      await fs.writeAsStringAsync(target, base64Data, {
        encoding: fs.EncodingType.Base64,
      });
      await storeItem(`${STORAGE_PREFIX}${key}`, target);
      return;
    } catch {
      // Fall through to key-value storage
    }
  }

  // 3. Key-value fallback
  await storeItem(`${STORAGE_PREFIX}${key}`, dataUrl);
};

/** Retrieve durable card image (IndexedDB, FileSystem, or fallback) */
export const getDurableImage = async (key: string): Promise<string | null> => {
  // 1. IndexedDB on Web
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await getIndexedDb();
      if (db) {
        const result = await new Promise<string | null>((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const store = tx.objectStore(IDB_STORE);
          const req = store.get(key);
          req.onsuccess = () => resolve((req.result as string) || null);
          req.onerror = () => resolve(null);
        });
        if (result && !result.startsWith('blob:')) return result;
      }
    } catch {}
  }

  // 2. Native FileSystem
  const fs = await getFileSystem();
  if (fs && fs.documentDirectory) {
    try {
      const target = `${fs.documentDirectory}ascend_cards/${key}.jpg`;
      const info = await fs.getInfoAsync(target);
      if (info.exists) {
        return target;
      }
    } catch {}
  }

  // 3. Key-value fallback
  const direct = await getItem(`${STORAGE_PREFIX}${key}`);
  if (direct && !direct.startsWith('blob:')) return direct;
  const legacy = await getItem(`adaptive_card_${key}`);
  if (legacy && !legacy.startsWith('blob:')) return legacy;
  return null;
};

/**
 * Saves the customized card locally in durable media storage (permanent on author's device)
 * and uploads it to Cloud Run -> GCS if signed in.
 *
 * - Signed-out users: Card is saved locally in durable media storage and marked 'local_only'.
 *   Returns null for cloud URL, but local card is 100% available for viewing, export, and local sharing.
 * - Signed-in users: Card is uploaded to Cloud Run proxy with user JWT and scoped under user ID.
 *   Returns confirmed cloud URL on success; on network failure returns null (never a fake 404 URL).
 */
export const persistCustomCard = async (
  sessionId: string,
  cardFile: { file?: File | Blob | null; url: string; dataUrl?: string },
): Promise<string | null> => {
  if (!sessionId) return null;
  const safeId = sanitizeSessionId(sessionId);

  // 1. Resolve and persist durable data (NEVER temporary blob URLs)
  const durableDataUrl = await resolveDurableDataUrl(cardFile);
  if (durableDataUrl) {
    await putDurableImage(safeId, durableDataUrl);
  }

  // 2. Check user authentication
  const token = await currentAccessToken();
  if (!token) {
    // Signed-out user:
    // Card is preserved locally in durable storage so the author can preview,
    // export, and share it on their device. Cloud sync requires sign in.
    await storeItem(
      `${STATUS_PREFIX}${safeId}`,
      JSON.stringify({
        sessionId: safeId,
        status: 'local_only',
        updatedAt: Date.now(),
      } satisfies CardSyncStatus),
    );
    return null;
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

  // 3. Upload to Cloud Run proxy -> GCS with verified user token
  try {
    let arrayBuffer: ArrayBuffer | null = null;
    if (cardFile.file) {
      arrayBuffer = await cardFile.file.arrayBuffer();
    } else if (durableDataUrl && durableDataUrl.startsWith('data:')) {
      arrayBuffer = dataUrlToArrayBuffer(durableDataUrl);
    }

    if (arrayBuffer && arrayBuffer.byteLength > 0) {
      const headers: Record<string, string> = {
        'Content-Type': 'image/jpeg',
        'x-session-id': safeId,
        'Authorization': `Bearer ${token}`,
      };

      const res = await fetch(`${proxyBase()}/api/upload-card?sessionId=${encodeURIComponent(safeId)}`, {
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
      const errData = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errData.error || `HTTP ${res.status}`);
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
    return null;
  }

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
  return getDurableImage(safeId);
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
  const safeId = sanitizeSessionId(sessionId);
  const localImage = await getLocalCustomCard(safeId);
  if (!localImage) return null;

  const token = await currentAccessToken();
  if (!token) {
    await storeItem(
      `${STATUS_PREFIX}${safeId}`,
      JSON.stringify({
        sessionId: safeId,
        status: 'local_only',
        error: 'Sign in required for cloud sync',
        updatedAt: Date.now(),
      } satisfies CardSyncStatus),
    );
    return null;
  }

  try {
    let arrayBuffer: ArrayBuffer;
    if (localImage.startsWith('data:')) {
      arrayBuffer = dataUrlToArrayBuffer(localImage);
    } else {
      const resp = await fetch(localImage);
      arrayBuffer = await resp.arrayBuffer();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'image/jpeg',
      'x-session-id': safeId,
      'Authorization': `Bearer ${token}`,
    };

    const res = await fetch(`${proxyBase()}/api/upload-card?sessionId=${encodeURIComponent(safeId)}`, {
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

/** Delete local card image from durable media storage */
export const removeLocalCustomCard = async (sessionId: string): Promise<void> => {
  const safeId = sanitizeSessionId(sessionId);
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await getIndexedDb();
      if (db) {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(safeId);
      }
    } catch {}
  }
  const fs = await getFileSystem();
  if (fs && fs.documentDirectory) {
    try {
      const target = `${fs.documentDirectory}ascend_cards/${safeId}.jpg`;
      await fs.deleteAsync(target, { idempotent: true });
    } catch {}
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${STORAGE_PREFIX}${safeId}`);
      localStorage.removeItem(`${STATUS_PREFIX}${safeId}`);
    }
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${safeId}`);
    await AsyncStorage.removeItem(`${STATUS_PREFIX}${safeId}`);
  } catch {}
};
