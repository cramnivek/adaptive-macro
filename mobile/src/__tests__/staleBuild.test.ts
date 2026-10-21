import { describe, expect, it } from 'vitest';
import { entryBundleIn, isStaleChunkError, shouldReload } from '../platform/staleBuild';

describe('isStaleChunkError', () => {
  it('recognises a lazily loaded file the server no longer has, in each browser’s words', () => {
    // Metro's own loader, as seen on the live site after a deploy.
    expect(
      isStaleChunkError(
        new Error(
          'Loading module https://example.app/_expo/static/js/web/geminiDescribe-4b2cb2.js failed. (error: https://example.app/_expo/static/js/web/geminiDescribe-4b2cb2.js)',
        ),
      ),
    ).toBe(true);
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('leaves every other failure alone', () => {
    expect(isStaleChunkError(new Error('Could not reach the server. Check the connection and try again.'))).toBe(false);
    expect(isStaleChunkError(new Error('Gemini returned 429'))).toBe(false);
    expect(isStaleChunkError('Loading module failed')).toBe(false);
  });
});

describe('shouldReload', () => {
  it('reloads the first time, and not again within a minute, so a genuinely missing file cannot loop', () => {
    expect(shouldReload(null, 1_000_000)).toBe(true);
    expect(shouldReload(1_000_000 - 30_000, 1_000_000)).toBe(false);
    expect(shouldReload(1_000_000 - 61_000, 1_000_000)).toBe(true);
  });
});

describe('entryBundleIn', () => {
  it('finds the build’s entry bundle in a served page', () => {
    const html = '<script src="/_expo/static/js/web/entry-ad5c6b3886ceeb804344f30dcc27bf7a.js" defer></script>';
    expect(entryBundleIn(html)).toBe('_expo/static/js/web/entry-ad5c6b3886ceeb804344f30dcc27bf7a.js');
  });

  it('has nothing to say in development, where there is no such file', () => {
    expect(entryBundleIn('<script src="/node_modules/expo-router/entry.bundle?platform=web"></script>')).toBeNull();
  });
});
