import { describe, expect, it } from 'vitest';
import { shouldAskAbout } from '../dayStatus';

const TARGET = 2200;

describe('shouldAskAbout', () => {
  it('asks about a day logged at well under half the target', () => {
    expect(shouldAskAbout(800, undefined, TARGET)).toBe(true);
  });

  it('does not ask about an ordinary day, or one just over half', () => {
    expect(shouldAskAbout(2100, undefined, TARGET)).toBe(false);
    expect(shouldAskAbout(1100, undefined, TARGET)).toBe(false);
  });

  it('does not ask once the day has been answered either way', () => {
    expect(shouldAskAbout(800, true, TARGET)).toBe(false);
    expect(shouldAskAbout(800, false, TARGET)).toBe(false);
  });

  it('does not ask about a day with nothing logged, which the estimate already skips', () => {
    expect(shouldAskAbout(undefined, undefined, TARGET)).toBe(false);
    expect(shouldAskAbout(0, undefined, TARGET)).toBe(false);
  });
});
