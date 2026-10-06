import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Frontend dev server.
 *
 * In development Vite serves the React app on :5173 and proxies /api to the
 * Express server on :5000, so the browser only ever talks to one origin and no
 * CORS workaround is needed while developing.
 *
 * In production `npm run build` emits frontend/dist, which the Express server
 * serves itself (see backend/src/app.js).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
