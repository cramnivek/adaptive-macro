import { defineConfig } from 'vitest/config';

/**
 * Only the pure modules under src/api and src/ai are tested here. Anything
 * touching expo-sqlite or React Native native modules has no node driver and
 * is verified in the running app instead.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
