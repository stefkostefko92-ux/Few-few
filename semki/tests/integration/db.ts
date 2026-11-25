// Тестовата база: само име с „_test“ (тестовете трият таблиците), миграциите — същите като в продукция.
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

export function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('липсва TEST_DATABASE_URL');
  const name = new URL(raw).pathname.replace(/^\//, '');
  if (!name.endsWith('_test'))
    throw new Error(`отказвам база „${name}“ — името трябва да завършва на _test`);
  return raw;
}

export function prepareDb(): PrismaClient {
  const url = testDatabaseUrl();
  execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  return new PrismaClient({ datasourceUrl: url });
}

export async function resetDb(db: PrismaClient): Promise<void> {
  await db.$executeRaw`TRUNCATE "Notification", "Batch", "AlertRule" RESTART IDENTITY CASCADE`;
  await db.seedType.updateMany({ data: { decayPercent: 0.6, decayMinutes: 60 } });
  await db.settings.update({
    where: { id: 1 },
    data: {
      dashboardRoleId: null,
      commandRoleId: null,
      quietEnabled: false,
      windowStart: '10:00',
      windowEnd: '23:00',
      timezone: 'Europe/Sofia',
    },
  });
}
