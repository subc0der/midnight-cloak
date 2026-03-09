import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
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
  },
});
