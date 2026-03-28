import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/e2e/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
});
