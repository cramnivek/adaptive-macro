import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  available: vi.fn(), write: vi.fn(), share: vi.fn(), textShare: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Share: { share: native.textShare } }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: native.available, shareAsync: native.share }));
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
  writeAsStringAsync: native.write,
}));

import { shareStickerPng, shareWorkout } from '../platform/shareImage';
import type { ShareCard } from '../shareCard';

describe('Android transparent sticker sharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.available.mockResolvedValue(true);
    native.write.mockResolvedValue(undefined);
    native.share.mockResolvedValue(undefined);
  });

  it('writes the bridge PNG bytes to a local file before opening the native share sheet', async () => {
    // A one-pixel transparent PNG is the same serializable payload the DOM bridge returns.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';
    const result = await shareStickerPng('Push Day', {
      url: `data:image/png;base64,${png}`, width: 1, height: 1,
    });
    expect(result).toBe('shared');
    expect(native.write).toHaveBeenCalledWith('file:///cache/push-day-sticker.png', png, { encoding: 'base64' });
    expect(native.share).toHaveBeenCalledWith('file:///cache/push-day-sticker.png', {
      mimeType: 'image/png', dialogTitle: 'Push Day Sticker', UTI: 'public.png',
    });
    expect(native.write.mock.invocationCallOrder[0]).toBeLessThan(native.share.mock.invocationCallOrder[0]);
  });

  it('reports unavailable sharing instead of claiming the sticker was saved', async () => {
    native.available.mockResolvedValue(false);
    expect(await shareStickerPng('Push', { url: 'data:image/png;base64,AAAA', width: 1, height: 1 })).toBe('failed');
    expect(native.write).not.toHaveBeenCalled();
    expect(native.share).not.toHaveBeenCalled();
  });

  it('reports a file-write failure instead of silently treating it as cancellation', async () => {
    native.write.mockRejectedValue(new Error('Disk full'));
    expect(await shareStickerPng('Push', { url: 'data:image/png;base64,AAAA', width: 1, height: 1 })).toBe('failed');
    expect(native.share).not.toHaveBeenCalled();
  });

  it('shares a rendered workout PNG with matching file extension and MIME type', async () => {
    await shareWorkout({ title: 'Push Day' } as ShareCard, { url: 'data:image/png;base64,AAAA' });
    expect(native.write).toHaveBeenCalledWith('file:///cache/ascend-workout-card.png', 'AAAA', { encoding: 'base64' });
    expect(native.share).toHaveBeenCalledWith('file:///cache/ascend-workout-card.png', {
      mimeType: 'image/png', dialogTitle: 'Push Day', UTI: 'public.png',
    });
  });

  it('reports a workout image write failure without silently sharing text instead', async () => {
    native.write.mockRejectedValue(new Error('Disk full'));
    expect(await shareWorkout({ title: 'Push Day', exercises: [] } as unknown as ShareCard, { url: 'data:image/png;base64,AAAA' })).toBe('failed');
    expect(native.textShare).not.toHaveBeenCalled();
  });
});
