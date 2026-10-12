import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { Redis } from 'ioredis';

/**
 * Redis 7 за интеграционните тестове (опашки, pub/sub между хъбовете, лимити, TOTP). С
 * REDIS_TEST_URL — тази инстанция (само 127.0.0.1/localhost: тестът не пипа чужд Redis); иначе
 * тестът пуска свой `redis-server` на свободен порт, без запис на диска, и го спира накрая.
 * Ключовете на всеки прогон са с отделен префикс — нищо не се трие наслуки (без FLUSHALL).
 */

export interface TestRedis {
  url: string;
  /** Уникален префикс за този прогон (опашки, канал). */
  prefix: string;
  client(name?: string, blocking?: boolean): Redis;
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function waitReady(url: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const probe = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    try {
      await probe.connect();
      await probe.ping();
      probe.disconnect();
      return;
    } catch {
      probe.disconnect();
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('redis-server не тръгна');
}

export async function startRedis(): Promise<TestRedis> {
  const clients: Redis[] = [];
  let child: ChildProcess | null = null;
  let url = process.env.REDIS_TEST_URL ?? '';
  if (url) {
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error('REDIS_TEST_URL трябва да е локален (127.0.0.1/localhost).');
    }
  } else {
    const port = await freePort();
    child = spawn(
      'redis-server',
      ['--port', String(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'],
      {
        stdio: 'ignore',
      },
    );
    child.once('error', () => undefined);
    url = `redis://127.0.0.1:${port}`;
  }
  await waitReady(url);
  return {
    url,
    prefix: `cctest-${randomBytes(4).toString('hex')}`,
    client(name = 'test', blocking = false) {
      const c = new Redis(url, { connectionName: name, maxRetriesPerRequest: blocking ? null : 2 });
      c.on('error', () => undefined);
      clients.push(c);
      return c;
    },
    async stop() {
      await Promise.allSettled(clients.map((c) => c.quit()));
      if (child) {
        child.kill('SIGTERM');
        await new Promise((r) => child?.once('exit', r));
      }
    },
  };
}
