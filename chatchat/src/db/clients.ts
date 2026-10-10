import { PrismaClient } from '@prisma/client';
import { tenantScopedClient } from './rls.js';
import { assertRlsRole } from './guard.js';

/**
 * Двете връзки на процеса: `db` — ролята на приложението под RLS (всяка заявка с клиента на
 * работата), `system` — системната роля (BYPASSRLS) само за задачите, които обикалят клиенти.
 * Без SYSTEM_DATABASE_URL `system` е основната връзка (разработка с ролята на собственика); в
 * продукция това е отказ при старт (`ensureDbRoles`).
 */

export interface DbClients {
  db: PrismaClient;
  system: PrismaClient;
  disconnect(): Promise<void>;
}

export function createDbClients(cfg: {
  DATABASE_URL: string;
  SYSTEM_DATABASE_URL: string;
}): DbClients {
  const base = new PrismaClient({ datasources: { db: { url: cfg.DATABASE_URL } } });
  const separate =
    cfg.SYSTEM_DATABASE_URL !== ''
      ? new PrismaClient({ datasources: { db: { url: cfg.SYSTEM_DATABASE_URL } } })
      : null;
  return {
    db: tenantScopedClient(base),
    system: separate ?? base,
    disconnect: async () => {
      await Promise.all([base.$disconnect(), separate?.$disconnect()]);
    },
  };
}

/**
 * При старт на приложението и worker-а: в продукция (strict) ролята на DATABASE_URL не заобикаля
 * RLS и системната връзка е отделна — иначе процесът не тръгва (fail-closed). Извън продукция —
 * само предупреждения.
 */
export async function ensureDbRoles(
  clients: DbClients,
  cfg: { NODE_ENV: string; SYSTEM_DATABASE_URL: string },
  logger: { warn: (o: object, msg: string) => void },
): Promise<void> {
  const strict = cfg.NODE_ENV === 'production';
  await assertRlsRole(clients.db, { strict, warn: (o, m) => logger.warn(o, m) });
  if (cfg.SYSTEM_DATABASE_URL !== '') return;
  if (strict) {
    throw new Error(
      'SYSTEM_DATABASE_URL липсва — outbox-ите и прегледите през клиенти не биха виждали нищо под RLS ' +
        '(DEPLOY.md, „Роли на базата“).',
    );
  }
  logger.warn({}, 'SYSTEM_DATABASE_URL липсва — системните задачи ползват DATABASE_URL');
}

/**
 * Връзката на CLI-тата (ретенция, клиент/потребител, файлове, вектори, одит): системната роля, защото
 * обикалят клиенти или създават клиент. Празно SYSTEM_DATABASE_URL → DATABASE_URL (разработка).
 */
export function systemClientFromEnv(env: NodeJS.ProcessEnv = process.env): PrismaClient {
  const url = env.SYSTEM_DATABASE_URL || env.DATABASE_URL;
  if (!url) throw new Error('Липсва SYSTEM_DATABASE_URL/DATABASE_URL.');
  return new PrismaClient({ datasources: { db: { url } } });
}
