import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const LEVELS_DIR = fileURLToPath(new URL('../shared/src/levels/', import.meta.url));
/** Largest level file the editor may write (zone 1 is ~70 KB). */
const MAX_LEVEL_BYTES = 2_000_000;

/**
 * Dev-only endpoint for the level editor (`?editor`): POST /__aranya/level/<id>
 * overwrites shared/src/levels/<id>.json with the posted text. The browser
 * validates with parseLevelFile() before saving; this only guards the path,
 * size and JSON shape. Not part of production builds (apply: 'serve').
 * Saving restarts the dev game server (tsx watch) and reloads the page.
 */
function levelSavePlugin(): Plugin {
  return {
    name: 'aranya-level-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__aranya/level/', (req, res) => {
        const fail = (code: number, msg: string): void => {
          res.statusCode = code;
          res.end(msg);
        };
        if (req.method !== 'POST') return fail(405, 'POST only');
        const id = (req.url ?? '').replace(/^\//, '').replace(/\?.*$/, '');
        if (!/^[a-z0-9_]+$/.test(id)) return fail(400, 'bad level id');
        const target = `${LEVELS_DIR}${id}.json`;
        if (!existsSync(target)) return fail(404, 'unknown level');
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > MAX_LEVEL_BYTES) req.destroy();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { id?: unknown };
            if (parsed.id !== id) return fail(400, 'level id mismatch');
          } catch {
            return fail(400, 'not JSON');
          }
          writeFileSync(target, body);
          res.statusCode = 200;
          res.end('saved');
        });
      });
    },
  };
}

// The palette in /art is imported as raw text; Vite already allows it because
// the pnpm workspace root (repo root) is the default fs.allow boundary.
export default defineConfig({
  plugins: [levelSavePlugin()],
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
