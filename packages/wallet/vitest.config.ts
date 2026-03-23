import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      exclude: ['node_modules', 'dist', 'tests', '*.config.ts', 'src/index.ts'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 90,
        lines: 85,
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
