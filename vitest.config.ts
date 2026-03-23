import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'build'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
      exclude: ['node_modules', 'dist', 'build', '**/*.d.ts', '**/*.config.*'],
      thresholds: {
        statements: 40,
        branches: 40,
        functions: 35,
        lines: 40,
      },
    },
  },
});
