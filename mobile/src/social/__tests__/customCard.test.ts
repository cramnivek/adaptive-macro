import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  currentAccessToken: vi.fn().mockResolvedValue('jwt-mock'),
}));

import { currentAccessToken } from '../api';
import {
  dataUrlToArrayBuffer,
  getCustomCardStatus,
  getLocalCustomCard,
  getPublicCardUrl,
  persistCustomCard,
  removeLocalCustomCard,
  resolveDurableDataUrl,
  retryCustomCardUpload,
  sanitizeSessionId,
} from '../customCard';

describe('customCard persistence & sync', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.mocked(currentAccessToken).mockResolvedValue('jwt-mock');
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
    });
  });

  it('sanitizes session ids to safe characters', () => {
    expect(sanitizeSessionId('session 123/abc?def=1')).toBe('session_123_abc_def_1');
    expect(sanitizeSessionId('clean-id_123')).toBe('clean-id_123');
  });

  it('constructs public GCS card URLs scoped by authorId when provided', () => {
    expect(getPublicCardUrl('workout-1', 'user-456')).toBe(
      'https://storage.googleapis.com/adaptive-macro-card-images/user-456/workout-1.jpg',
    );
    expect(getPublicCardUrl('workout-1')).toBe(
      'https://storage.googleapis.com/adaptive-macro-card-images/workout-1.jpg',
    );
    expect(getPublicCardUrl(null)).toBeNull();
  });

  it('converts base64 data URLs to ArrayBuffer accurately', () => {
    const original = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const buffer = dataUrlToArrayBuffer(original);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[2]).toBe(0xff);
  });

  it('resolves durable data URLs and never returns raw ephemeral blob URLs', async () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const fromData = await resolveDurableDataUrl({ dataUrl });
    expect(fromData).toBe(dataUrl);

    // If conversion of a blob URL fails, returns null (never the raw blob: URL)
    vi.stubGlobal('fetch', async () => {
      throw new Error('Blob fetch failed');
    });
    const fromFailedBlob = await resolveDurableDataUrl({ url: 'blob:http://localhost:8081/abc-123' });
    expect(fromFailedBlob).toBeNull();
  });

  it('preserves cards locally with local_only status for signed-out users (no upload call)', async () => {
    vi.mocked(currentAccessToken).mockResolvedValue(null);
    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await persistCustomCard('sess-signed-out', {
      url: sampleDataUrl,
      dataUrl: sampleDataUrl,
    });

    // Cloud URL is null for signed out
    expect(result).toBeNull();
    // But fetch to upload endpoint was NEVER called
    expect(fetchSpy).not.toHaveBeenCalled();

    // Local card is 100% saved and available for local export/preview
    const local = await getLocalCustomCard('sess-signed-out');
    expect(local).toBe(sampleDataUrl);

    const status = await getCustomCardStatus('sess-signed-out');
    expect(status?.status).toBe('local_only');
  });

  it('saves durable data URL and returns confirmed cloud URL on success when signed in', async () => {
    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const cloudUrl = 'https://storage.googleapis.com/adaptive-macro-card-images/user/sess-1.jpg';

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ ok: true, url: cloudUrl }),
    }));

    const result = await persistCustomCard('sess-1', {
      url: sampleDataUrl,
      dataUrl: sampleDataUrl,
    });

    expect(result).toBe(cloudUrl);
    const local = await getLocalCustomCard('sess-1');
    expect(local).toBe(sampleDataUrl);

    const status = await getCustomCardStatus('sess-1');
    expect(status?.status).toBe('synced');
    expect(status?.cloudUrl).toBe(cloudUrl);
  });

  it('preserves local card and returns null (never fake URL) when cloud upload fails', async () => {
    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 500,
    }));

    const result = await persistCustomCard('sess-fail', {
      url: sampleDataUrl,
      dataUrl: sampleDataUrl,
    });

    // Never return fake URL
    expect(result).toBeNull();

    // Local card is still preserved for the author
    const local = await getLocalCustomCard('sess-fail');
    expect(local).toBe(sampleDataUrl);

    // Status is recorded as failed so UI can offer retry
    const status = await getCustomCardStatus('sess-fail');
    expect(status?.status).toBe('failed');
  });

  it('supports retrying a failed upload from durable local storage', async () => {
    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const cloudUrl = 'https://storage.googleapis.com/adaptive-macro-card-images/retry.jpg';

    // 1. Initial failed attempt
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503 }));
    await persistCustomCard('sess-retry', { url: sampleDataUrl, dataUrl: sampleDataUrl });
    expect(await getLocalCustomCard('sess-retry')).toBe(sampleDataUrl);
    expect((await getCustomCardStatus('sess-retry'))?.status).toBe('failed');

    // 2. Retry with recovered connection
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ ok: true, url: cloudUrl }),
    }));

    const retryResult = await retryCustomCardUpload('sess-retry');
    expect(retryResult).toBe(cloudUrl);
    expect((await getCustomCardStatus('sess-retry'))?.status).toBe('synced');
  });

  it('supports deleting local card and cleaning up metadata', async () => {
    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    await persistCustomCard('sess-del', { url: sampleDataUrl, dataUrl: sampleDataUrl });
    expect(await getLocalCustomCard('sess-del')).toBe(sampleDataUrl);

    await removeLocalCustomCard('sess-del');
    expect(await getLocalCustomCard('sess-del')).toBeNull();
    expect(await getCustomCardStatus('sess-del')).toBeNull();
  });
});
