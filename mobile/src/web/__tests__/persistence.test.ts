import { afterEach, describe, expect, it, vi } from 'vitest';
import { needsHomeScreenInstall, requestPersistentStorage } from '../persistence';

afterEach(() => vi.unstubAllGlobals());

const withNavigator = (nav: unknown) => vi.stubGlobal('navigator', nav);

/** A browser: iOS Safari in a tab, not yet installed. */
const asIosBrowser = (nav: Record<string, unknown> = {}) => {
  vi.stubGlobal('document', {});
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  withNavigator({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
    ...nav,
  });
};

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
    withNavigator({
      storage: {
        persisted: async () => {
          throw new Error('nope');
        },
        persist: async () => true,
      },
    });
    expect(await requestPersistentStorage()).toBe('unsupported');
  });
});

describe('needsHomeScreenInstall', () => {
  it('is true for iOS Safari in a browser tab', () => {
    asIosBrowser();
    expect(needsHomeScreenInstall()).toBe(true);
  });

  it('is false once running standalone from the home screen', () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    withNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
    });

    expect(needsHomeScreenInstall()).toBe(false);
  });

  // iOS before 16.4 does not match the display-mode query, so the legacy
  // navigator.standalone flag is the only signal that the install happened.
  // Without it an already-installed user is nagged forever.
  it('is false when only the legacy navigator.standalone flag is set', () => {
    asIosBrowser({ standalone: true });
    expect(needsHomeScreenInstall()).toBe(false);
  });

  it('is false off iOS, where the seven-day rule does not apply', () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    withNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' });

    expect(needsHomeScreenInstall()).toBe(false);
  });

  // iPadOS 13+ reports a desktop Mac user agent and is distinguished only by
  // touch points. It is subject to the same seven-day eviction, so missing it
  // means silent data loss on an iPad.
  it('is true for an iPad masquerading as a Mac', () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    withNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari',
      maxTouchPoints: 5,
    });

    expect(needsHomeScreenInstall()).toBe(true);
  });

  it('is false for a real Mac, which has no touch screen', () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    withNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari',
      maxTouchPoints: 0,
    });

    expect(needsHomeScreenInstall()).toBe(false);
  });

  // THE DEFECT THIS BRIEF EXISTS TO PREVENT. React Native has a navigator
  // whose userAgent can contain "iPhone", but no document. The plan's version
  // returned TRUE here, which would tell someone using the native iOS app to
  // tap Share and Add to Home Screen.
  it('is false in React Native, which has a navigator but no document', () => {
    withNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    expect(needsHomeScreenInstall()).toBe(false);
  });
});
