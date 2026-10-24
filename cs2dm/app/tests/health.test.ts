import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { fakeRepo, sampleData, start } from './helpers.js';

test('/health: 200 само когато базата и Redis отговарят', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const response = await app.get('/health');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'ok', db: 'ok', redis: 'ok' });
  } finally {
    await app.close();
  }
});

test('/health: 503 без база — с истински Prisma клиент към затворен порт', async () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://nobody:nothing@127.0.0.1:1/none?connect_timeout=2' } },
  });
  const app = await start({
    repo: fakeRepo(sampleData()),
    health: {
      db: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      redis: async () => {},
    },
  });
  try {
    const response = await app.get('/health');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'degraded', db: 'fail', redis: 'ok' });
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});

test('/health: 503 и при паднал Redis; бавна проверка не виси', async () => {
  const app = await start({
    repo: fakeRepo(sampleData()),
    health: {
      db: async () => {},
      redis: () => new Promise<void>(() => {}),
    },
  });
  try {
    const started = Date.now();
    const response = await app.get('/health');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'degraded', db: 'ok', redis: 'fail' });
    assert.ok(Date.now() - started < 4000, 'таймаутът на проверката сработи');
  } finally {
    await app.close();
  }
});
