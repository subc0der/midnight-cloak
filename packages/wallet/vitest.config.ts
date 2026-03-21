import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@midnight-cloak/contracts': resolve(__dirname, '../contracts/dist/index.js'),
      '@midnight-cloak/core': resolve(__dirname, '../core/dist/index.js'),
    },
  },
});
