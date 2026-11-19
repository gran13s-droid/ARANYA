import { defineConfig } from 'vite';

// The palette in /art is imported as raw text; Vite already allows it because
// the pnpm workspace root (repo root) is the default fs.allow boundary.
export default defineConfig({
  server: {
    port: 5173,
    // Transform the entry graph at startup so the first page load does not stall.
    warmup: { clientFiles: ['./src/main.ts'] },
  },
  optimizeDeps: {
    // Pre-bundle the heavy deps at startup instead of discovering them on the
    // first request (which forces a full page reload mid-load).
    include: ['@babylonjs/core', '@colyseus/sdk'],
  },
  build: {
    target: 'es2022',
  },
});
