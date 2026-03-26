import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Check if circuit files exist (they're gitignored, won't exist in CI)
// Check each directory individually - keys only exist with full ZK compilation
const zkirExists = existsSync('../../packages/contracts/src/managed/age-verifier/zkir');
const keysExist = existsSync('../../packages/contracts/src/managed/age-verifier/keys');

// Build copy targets based on what actually exists
const circuitCopyTargets = [
  ...(zkirExists
    ? [{ src: '../../packages/contracts/src/managed/age-verifier/zkir/*', dest: 'circuits/age-verifier/zkir' }]
    : []),
  ...(keysExist
    ? [{ src: '../../packages/contracts/src/managed/age-verifier/keys/*', dest: 'circuits/age-verifier/keys' }]
    : []),
];

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    // Copy circuit files so extension can fetch them via HTTP
    // The extension's FetchZkConfigProvider requires circuits served over HTTP/HTTPS
    // Only copy circuits that exist locally (keys only exist with full ZK compilation)
    ...(circuitCopyTargets.length > 0
      ? [viteStaticCopy({ targets: circuitCopyTargets })]
      : []),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@midnight-cloak/core': resolve(__dirname, '../../packages/core/src'),
      '@midnight-cloak/react': resolve(__dirname, '../../packages/react/src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    open: false,
    // Enable CORS for extension to fetch circuits
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
  },
  optimizeDeps: {
    // Exclude WASM modules from optimization
    exclude: ['@midnight-ntwrk/ledger-v7'],
  },
});
