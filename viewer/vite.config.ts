/**
 * Vite config for the browser client (`src/client/`).
 *
 * - `vite build` writes `dist/client/`, which the viewer server serves
 *   (`server/http.ts`, `DEFAULT_CLIENT_DIR`).
 * - In dev, `/api` (the event stream included) is proxied to the viewer
 *   server named by `PHASE_VIEWER_API`. `npm run dev` (`scripts/dev.ts`) sets
 *   it to the server it starts; run on its own, Vite expects a server on the
 *   CLI's default port.
 */
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.PHASE_VIEWER_API ?? 'http://127.0.0.1:4747';

export default defineConfig({
  root: fileURLToPath(new URL('./src/client/', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/client/', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': { target: apiTarget },
    },
  },
});
