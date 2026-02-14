import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['better-sqlite3', 'ws', 'bufferutil', 'utf-8-validate', 'ffmpeg-static'],
    },
  },
});
