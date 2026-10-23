import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickNativeCardPhoto } from '../nativeCardPhoto';

const native = vi.hoisted(() => ({ pick: vi.fn(), manipulate: vi.fn(), resize: vi.fn(), save: vi.fn(), release: vi.fn() }));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: native.pick }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: native.manipulate }, SaveFormat: { JPEG: 'jpeg' } }));

beforeEach(() => {
  vi.clearAllMocks();
  const image = { width: 4000, height: 3000, saveAsync: native.save, release: native.release };
  const context = { renderAsync: vi.fn().mockResolvedValue(image), resize: native.resize, release: native.release };
  native.manipulate.mockReturnValue(context);
  native.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///photo.heic' }] });
  native.save.mockResolvedValue({ base64: 'encoded-jpeg' });
});

describe('native card photo preparation', () => {
  it('keeps cancellation silent and does no image work', async () => {
    native.pick.mockResolvedValue({ canceled: true, assets: [] });
    expect(await pickNativeCardPhoto()).toBeNull();
    expect(native.manipulate).not.toHaveBeenCalled();
  });
  it('bounds camera-roll photos before bridging and returns the encoded MIME type', async () => {
    expect(await pickNativeCardPhoto()).toBe('data:image/jpeg;base64,encoded-jpeg');
    expect(native.resize).toHaveBeenCalledWith({ width: 1920 });
    expect(native.save).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.9, base64: true });
    expect(native.release).toHaveBeenCalled();
  });
  it('rejects a missing image body rather than providing an empty photo', async () => {
    native.save.mockResolvedValue({});
    await expect(pickNativeCardPhoto()).rejects.toThrow('photo');
    expect(native.release).toHaveBeenCalled();
  });
  it('bounds a portrait by height and leaves a small image at its original size', async () => {
    native.manipulate.mockReturnValueOnce({ renderAsync: async () => ({ width: 3000, height: 4000, release: native.release }), release: native.release });
    await pickNativeCardPhoto();
    expect(native.resize).toHaveBeenCalledWith({ height: 1920 });
    native.resize.mockClear();
    native.manipulate.mockReturnValueOnce({ renderAsync: async () => ({ width: 800, height: 1200, release: native.release }), release: native.release });
    await pickNativeCardPhoto();
    expect(native.resize).not.toHaveBeenCalled();
  });
  it('releases the source context if decoding fails', async () => {
    native.manipulate.mockReturnValueOnce({ renderAsync: async () => { throw new Error('decode failed'); }, release: native.release });
    await expect(pickNativeCardPhoto()).rejects.toThrow('decode failed');
    expect(native.release).toHaveBeenCalledTimes(1);
  });
});
