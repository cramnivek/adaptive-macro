import { afterEach, describe, expect, it, vi } from 'vitest';
import { needsHomeScreenInstall, requestPersistentStorage } from '../persistence';

afterEach(() => vi.unstubAllGlobals());

const withNavigator = (nav: unknown) => vi.stubGlobal('navigator', nav);

describe('requestPersistentStorage', () => {
  it('reports unsupported where the API is absent, without throwing', async () => {
    withNavigator({});
    expect(await requestPersistentStorage()).toBe('unsupported');
  });

  it('does not re-request when already persisted', async () => {
    const persist = vi.fn();
    withNavigator({ storage: { persisted: async () => true, persist } });

    expect(await requestPersistentStorage()).toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence when not yet granted', async () => {
    const persist = vi.fn(async () => true);
    withNavigator({ storage: { persisted: async () => false, persist } });

    expect(await requestPersistentStorage()).toBe('persisted');
    expect(persist).toHaveBeenCalled();
  });

  it('reports denial rather than pretending it worked', async () => {
    withNavigator({ storage: { persisted: async () => false, persist: async () => false } });
    expect(await requestPersistentStorage()).toBe('denied');
  });

  // Called at startup: a throw here must never take the app down with it.
  it('survives the API throwing', async () => {
    withNavigator({ storage: { persisted: async () => { throw new Error('nope'); } } });
    expect(await requestPersistentStorage()).toBe('unsupported');
  });
});

describe('needsHomeScreenInstall', () => {
  it('is true for iOS Safari in a browser tab', () => {
    withNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari' });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });

    expect(needsHomeScreenInstall()).toBe(true);
  });

  it('is false once running standalone from the home screen', () => {
    withNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari' });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });

    expect(needsHomeScreenInstall()).toBe(false);
  });

  it('is false off iOS, where the seven-day rule does not apply', () => {
    withNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });

    expect(needsHomeScreenInstall()).toBe(false);
  });
});
