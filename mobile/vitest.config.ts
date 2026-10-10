import { defineConfig } from 'vitest/config';

/**
 * Pure modules, plus the data layer's SQL.
 *
 * Anything importing `react-native` still has no driver here and is verified
 * in the running app. The queries used to be in that bucket too — they live
 * inside functions bound to expo-sqlite, which cannot load under `node`. They
 * are now values in `db/catalogueQueries.ts`, run against a real SQLite built
 * from the real migrations.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
