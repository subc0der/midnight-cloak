import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      exclude: [
        'node_modules',
        'dist',
        'tests',
        '*.config.ts',
        'public',
        // Entry points with Chrome API side effects - not unit testable
        // These wire up event listeners and call tested logic
        'src/popup/main.tsx',
        'src/background/index.ts',
        'src/background/service-worker.ts',
        'src/offscreen/index.ts',
        'src/content/injected.ts',
        'src/content/content-script.ts',
        // Type definitions - no runtime code
        'src/shared/messaging/types.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
