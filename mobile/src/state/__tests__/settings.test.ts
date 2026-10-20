import { describe, expect, it, vi } from 'vitest';

// settings.ts reaches React Native and Expo through its defaults (the Ollama
// host, the proxy token). Neither matters to the merge under test, and the
// test runner cannot parse either, so both stand in as the little they read.
vi.mock('react-native', () => ({ Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: null } }));
import { DEFAULT_TEMPLATE } from '../../shareCardTemplate';
import { withDefaults } from '../settings';

describe('withDefaults', () => {
  it('falls back to the default card template for an id this build does not know', () => {
    expect(withDefaults({ cardTemplate: 'from-a-later-build' as never }).cardTemplate).toBe(DEFAULT_TEMPLATE);
    // Nor anything that merely exists on an object's prototype.
    expect(withDefaults({ cardTemplate: 'toString' as never }).cardTemplate).toBe(DEFAULT_TEMPLATE);
  });

  it('keeps a known card template', () => {
    expect(withDefaults({ cardTemplate: DEFAULT_TEMPLATE }).cardTemplate).toBe(DEFAULT_TEMPLATE);
  });

  it('asks for an account until someone chooses to go without one', () => {
    expect(withDefaults(null).accountSkipped).toBe(false);
    expect(withDefaults({ accountSkipped: true }).accountSkipped).toBe(true);
  });
});
