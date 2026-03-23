import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      exclude: ['node_modules', 'dist', 'tests', '*.config.ts', 'src/index.ts'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 65,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@midnight-cloak/contracts': resolve(__dirname, '../contracts/dist/index.js'),
      '@midnight-cloak/core': resolve(__dirname, '../core/dist/index.js'),
    },
  },
});
