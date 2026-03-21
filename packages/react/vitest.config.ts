import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@midnight-cloak/contracts': resolve(__dirname, '../contracts/dist/index.js'),
      '@midnight-cloak/core': resolve(__dirname, '../core/dist/index.js'),
    },
  },
});
