import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { createServer, type ViteDevServer } from 'vite';

/** Ports differ from `pnpm dev` (2567 / 5173) so e2e runs while dev is open. */
const SERVER_PORT = 2577;
const CLIENT_PORT = 5183;

const root = fileURLToPath(new URL('..', import.meta.url));

declare module 'vitest' {
  export interface ProvidedContext {
    serverUrl: string;
    clientUrl: string;
  }
}

function startGameServer(): Promise<ChildProcess> {
  // `--import tsx` keeps the server in this single node process, so killing it
  // leaves no orphaned children (unlike `pnpm dev` on Windows).
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', '--dev'], {
    cwd: `${root}server`,
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Game server did not start within 20 s:\n${log}`));
    }, 20_000);
    const onData = (buf: Buffer): void => {
      log += buf.toString();
      if (log.includes('listening on')) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Game server exited early (code ${code}):\n${log}`));
    });
  });
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const server = await startGameServer();

  // Vite reads VITE_* from process.env, so the client connects to the e2e server.
  process.env.VITE_SERVER_URL = `http://localhost:${SERVER_PORT}`;
  let vite: ViteDevServer | null = null;
  try {
    vite = await createServer({
      root: `${root}client`,
      configFile: `${root}client/vite.config.ts`,
      logLevel: 'error',
      // Own dep cache: sharing it with `pnpm dev` (different config) forces a re-optimize every run.
      cacheDir: `${root}node_modules/.vite-e2e`,
      server: { port: CLIENT_PORT, strictPort: true },
    });
    await vite.listen();
  } catch (err) {
    server.kill();
    throw err;
  }

  project.provide('serverUrl', `http://localhost:${SERVER_PORT}`);
  project.provide('clientUrl', `http://localhost:${CLIENT_PORT}/`);

  const killServer = (): void => {
    if (server.exitCode === null) server.kill();
  };
  process.once('exit', killServer);

  return async () => {
    await vite?.close();
    killServer();
  };
}
