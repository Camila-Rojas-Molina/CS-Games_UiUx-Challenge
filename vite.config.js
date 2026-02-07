import { defineConfig } from 'vite';

export default defineConfig({
  base: '/CS-Games_UiUx-Challenge/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist'
  }
});
