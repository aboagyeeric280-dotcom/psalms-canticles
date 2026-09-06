import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Keep the liturgical texts in their own chunks so the service worker
        // can cache them independently of the app shell.
        manualChunks(id) {
          if (id.includes('/src/data/weeks/')) return 'data-psalter';
          if (id.includes('/src/data/')) return 'data-book';
        },
      },
    },
  },
});
