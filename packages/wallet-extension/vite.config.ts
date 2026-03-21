import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { existsSync } from 'fs';
import manifest from './public/manifest.json';

// Check if circuit files exist (they're gitignored, won't exist in CI)
const circuitsExist = existsSync('../contracts/src/managed/age-verifier/zkir');

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    react(),
    crx({ manifest }),
    // Only copy circuits if they exist locally (not in CI where they're gitignored)
    ...(circuitsExist
      ? [
          viteStaticCopy({
            targets: [
              {
                src: '../contracts/src/managed/age-verifier/zkir/*',
                dest: 'circuits/age-verifier/zkir',
              },
              {
                src: '../contracts/src/managed/age-verifier/keys/*',
                dest: 'circuits/age-verifier/keys',
              },
              {
                src: '../contracts/src/managed/age-verifier/contract/*',
                dest: 'circuits/age-verifier/contract',
              },
            ],
          }),
        ]
      : []),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
    minify: false,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        offscreen: 'offscreen.html',
        'page-api': 'src/content/page-api.ts',
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Ensure page-api has a predictable name for web_accessible_resources
          if (chunkInfo.name === 'page-api') {
            return 'assets/page-api.js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
  },
  optimizeDeps: {
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: ['@midnight-ntwrk/ledger-v7'],
  },
});
