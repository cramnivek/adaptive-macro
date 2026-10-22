import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const load = vi.fn();
const add = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('document', { fonts: { add } });
  vi.stubGlobal('FontFace', class {
    constructor(public family: string, public source: string) {}
    load() { return load().then(() => this); }
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('DOM renderer font loading', () => {
  it('shares loaded and pending fonts across repeated rendering requests', async () => {
    load.mockResolvedValue(undefined);
    const { domFontsReady } = await import('../platform/domFonts');
    const faces: [string, string][] = [['Test Font', '/font.ttf']];
    await Promise.all([domFontsReady(faces), domFontsReady(faces)]);
    await domFontsReady(faces);
    expect(load).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('allows a failed font request to be retried', async () => {
    load.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
    const { domFontsReady } = await import('../platform/domFonts');
    const faces: [string, string][] = [['Test Font', '/font.ttf']];
    await expect(domFontsReady(faces)).rejects.toThrow('Offline');
    await domFontsReady(faces);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled font load instead of leaving a permanent spinner', async () => {
    vi.useFakeTimers();
    load.mockImplementation(() => new Promise(() => {}));
    const { domFontsReady } = await import('../platform/domFonts');
    const result = expect(domFontsReady([['Test Font', '/font.ttf']])).rejects.toThrow(/font.*timed out/i);
    await vi.advanceTimersByTimeAsync(10000);
    await result;
  });
});
