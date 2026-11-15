import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any folder or static host.
  base: './',
  server: {
    port: 5173,
  },
  build: {
    target: 'es2020',
    // Phaser alone is ~1.2 MB minified; it is split into its own cached chunk.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
