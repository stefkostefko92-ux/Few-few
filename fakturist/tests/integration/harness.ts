import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

/**
 * Интеграционните тестове вървят само срещу база, чието име съдържа `_test` или `_ci` — таблиците се
 * изпразват (TRUNCATE), схемата идва от миграциите (`migrate deploy`). Ключовете са случайни.
 */
export function prepareTestDatabase(): void {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url || !/_(test|ci)$/.test(new URL(url).pathname)) {
    throw new Error('TEST_DATABASE_URL липсва или името на базата не завършва на _test/_ci');
  }
  process.env['DATABASE_URL'] = url;
  process.env['NODE_ENV'] = 'test';
  process.env['PUBLIC_BASE_URL'] ??= 'http://127.0.0.1:4340';
  process.env['JWT_SECRET'] ??= randomBytes(32).toString('hex');
  process.env['LEDGER_SEAL_KEY'] ??= randomBytes(32).toString('hex');
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: process.env, stdio: 'ignore' });
}

/** Празни всички таблици на приложението (не и тази на миграциите). */
export async function truncateAll(db: {
  $queryRawUnsafe<T>(query: string): Promise<T>;
  $executeRawUnsafe(query: string): Promise<number>;
}): Promise<void> {
  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length === 0) return;
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
