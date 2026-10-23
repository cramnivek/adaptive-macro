import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('../platform/nativeSound', () => ({ playNativeSound: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('web alert audio sessions', () => {
  it('configures mixing before creating or resuming the Web Audio fallback', async () => {
    vi.resetModules();
    const session = { type: 'auto' };
    const observed: string[] = [];
    vi.stubGlobal('navigator', { audioSession: session });
    vi.stubGlobal('Audio', undefined);
    vi.stubGlobal('window', { AudioContext: class {
      state = 'suspended';
      constructor() { observed.push(session.type); }
      resume() { observed.push(session.type); return Promise.resolve(); }
    } });
    const { primeChime } = await import('../platform/chime');
    primeChime();
    expect(observed).toEqual(['ambient', 'ambient']);
  });

  it.each([undefined, {}, { audioSession: { get type() { return 'auto'; }, set type(_value: string) { throw new Error('Unsupported'); } } }])(
    'tolerates absent or partial browser support', async (browser) => {
      vi.stubGlobal('navigator', browser);
      const { configureWebAudioSession } = await import('../platform/webAudioSession');
      expect(() => configureWebAudioSession()).not.toThrow();
    },
  );

  it.each(['primeChime', 'playChime', 'primeEffect', 'playEffect'] as const)(
    'requests mixable audio before %s creates or plays a media element', async (action) => {
      vi.resetModules();
      const session = { type: 'auto' };
      const observed: string[] = [];
      vi.stubGlobal('navigator', { audioSession: session });
      vi.stubGlobal('window', {});
      vi.stubGlobal('Audio', class {
        muted = false;
        currentTime = 0;
        preload = '';
        constructor() { observed.push(session.type); }
        play() { observed.push(session.type); return Promise.resolve(); }
        pause() {}
      });
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:alert');
      const sounds = await import('../platform/chime');
      if (action === 'primeChime' || action === 'playChime') sounds[action]('bell');
      else sounds[action]('tick');
      await Promise.resolve();
      expect(observed).toEqual(['ambient', 'ambient']);
    },
  );
});
