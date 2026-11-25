import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Browser, nextIp, type Site } from './harness.js';

export interface ChildApp {
  site: Site;
  /** A browser that talks to this app (its address, its origin). */
  browser(): Browser;
  stop(): Promise<void>;
}

/**
 * Starts child-server.ts in its own process with these settings on top of the test environment (the same
 * test database). `origin` is the PUBLIC_BASE_URL the child gets: forms are checked against it.
 */
export async function startChildApp(
  env: Record<string, string>,
  origin = 'https://korpora.example',
): Promise<ChildApp> {
  const script = fileURLToPath(new URL('./child-server.ts', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', script], {
    env: { ...process.env, PUBLIC_BASE_URL: origin, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise<number>((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('the second app did not start')), 60_000);
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
      const found = /listening (\d+)/.exec(out);
      if (found) {
        clearTimeout(timer);
        resolve(Number(found[1]));
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`the second app exited with ${code}`));
    });
  });
  const site: Site = { base: `http://127.0.0.1:${port}`, origin };
  return {
    site,
    browser: () => new Browser(nextIp(), undefined, site),
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
      }),
  };
}
