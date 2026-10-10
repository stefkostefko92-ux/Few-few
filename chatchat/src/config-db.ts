import { z } from 'zod';

/**
 * Ролите на базата (NFR-03, §15.1 — изолацията на клиентите и в базата, RLS):
 *  - DATABASE_URL — `chatchat_app` (NOBYPASSRLS, не е собственик): приложението и worker-ът, всяка
 *    заявка под политиките на RLS с клиента на работата (src/db/rls.ts);
 *  - SYSTEM_DATABASE_URL — `chatchat_system` (BYPASSRLS): САМО задачите, които наистина обикалят
 *    клиенти (outbox-ите на имейла и helpdesk-а, прегледът на векторите, ретенцията, CLI-тата).
 *    Празно → DATABASE_URL (разработка с ролята на собственика); в продукция процесът не тръгва без
 *    него (src/db/clients.ts → ensureDbRoles).
 * Миграциите вървят като собственика (`chatchat`) — MIGRATE_DATABASE_URL в docker-entrypoint.sh,
 * който го маха от средата, преди да пусне приложението.
 */
export const DB_ENV = {
  SYSTEM_DATABASE_URL: z.string().default(''),
};
