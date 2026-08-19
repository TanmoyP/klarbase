import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },   // dev: same-origin, no CORS
  },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },  // top-level await
});
