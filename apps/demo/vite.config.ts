import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    // Copy circuit files so extension can fetch them via HTTP
    // The extension's FetchZkConfigProvider requires circuits served over HTTP/HTTPS
    viteStaticCopy({
      targets: [
        {
          src: '../../packages/contracts/src/managed/age-verifier/zkir/*',
          dest: 'circuits/age-verifier/zkir',
        },
        {
          src: '../../packages/contracts/src/managed/age-verifier/keys/*',
          dest: 'circuits/age-verifier/keys',
        },
      ],
    }),
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
  },
});
