import type { Prisma, PrismaClient } from '@prisma/client';
import { currentTenantId } from './tenant-context.js';

/**
 * Клиентът на Prisma на приложението (роля `chatchat_app`, под RLS — миграцията 20261011100000).
 * Клиентът на работата (`tenant-context.ts`) влиза в базата като `app.tenant_id` САМО локално за
 * транзакцията (`set_config(…, true)`) — никога на ниво сесия: връзките в пула се споделят.
 *
 *  - Единична заявка (модел или суров SQL) с контекст → пакетна транзакция [set_config, заявката] —
 *    официалният пример на Prisma за RLS (client extensions → query → „Wrap a query into a batch
 *    transaction“; `$allOperations` хваща и `$queryRaw`/`$executeRaw`).
 *  - Интерактивна транзакция `$transaction(async (tx) => …)` → set_config е ПЪРВАТА заявка в нея;
 *    `tx` е транзакционният клиент на основата (без разширението), затова заявките в нея не се
 *    опаковат втори път и остават в същата транзакция (иначе пакетът би ги изнесъл в нова).
 *  - Без контекст → заявката тръгва както е: RLS не връща редове и отказва запис (fail-closed).
 *    Така минават и тесните SECURITY DEFINER функции за откриване на клиента (`db/discovery.ts`).
 *  - Пакетната форма `$transaction([…])` НЕ се поддържа (обещанията ѝ вече са минали през
 *    разширението) — хвърля веднага, вместо тихо да разкъса транзакцията.
 */

type TxCallback = (tx: Prisma.TransactionClient) => Promise<unknown>;
interface TxOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

export function tenantScopedClient(base: PrismaClient): PrismaClient {
  const scoped = base.$extends({
    name: 'chatchat-tenant-rls',
    query: {
      async $allOperations({ args, query }) {
        const tenantId = currentTenantId();
        if (tenantId === null) return query(args);
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`,
          query(args),
        ]);
        return result;
      },
    },
  });

  const transaction = (fn: unknown, options?: TxOptions): Promise<unknown> => {
    if (typeof fn !== 'function') {
      throw new Error(
        'Пакетна $transaction([...]) не се поддържа под RLS — ползвай callback формата.',
      );
    }
    const tenantId = currentTenantId();
    return base.$transaction(async (tx) => {
      if (tenantId !== null) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      }
      return (fn as TxCallback)(tx);
    }, options);
  };

  // Същият договор като PrismaClient (моделите, суровият SQL, $transaction с callback, $disconnect)
  // — затова останалият код не се променя; подменен е само $transaction.
  return new Proxy(scoped, {
    get(target, prop) {
      if (prop === '$transaction') return transaction;
      return Reflect.get(target, prop);
    },
  }) as unknown as PrismaClient;
}
