import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Клиентът (tenant) на текущата работа — заявка на човек или задача на worker-а. Носи го
 * AsyncLocalStorage от `loadPrincipal` (или от изричното `withTenant`) до всяка заявка към базата:
 * клиентът на Prisma (`db/rls.ts`) го слага в транзакцията като `app.tenant_id`, а политиките на RLS
 * в базата пускат само редовете на този клиент. Без контекст базата не връща и не приема нищо
 * (fail-closed) — затова контекстът се задава веднага щом клиентът е известен.
 */

interface TenantScope {
  readonly tenantId: string;
}

const storage = new AsyncLocalStorage<TenantScope>();

/** id на клиента: cuid или подобен — само букви, цифри, „_“ и „-“ (никога празно). */
const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Клиентът на текущата работа или null (преди вход, системна задача без клиент). */
export function currentTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

/**
 * Изпълнява `fn` в контекста на клиента: всяка заявка към базата вътре (и в продълженията ѝ —
 * таймери, обещания) е под RLS на ТОЗИ клиент. Невалиден id → грешка, никога „без клиент“ тихо.
 */
export function withTenant<T>(tenantId: string, fn: () => T): T {
  if (!TENANT_ID.test(tenantId)) throw new Error('Невалиден id на клиент за контекста на базата.');
  return storage.run({ tenantId }, () => started(fn()));
}

/**
 * Заявката на Prisma (PrismaPromise) е мързелива — тръгва чак при `.then`. Ако `fn` я върне
 * директно (`withTenant(t, () => db.case.findMany())`), `.then` би се извикал ИЗВЪН контекста, от
 * викащия — и заявката би минала без клиент (нула редове). Затова всеки thenable се пуска веднага,
 * още вътре в контекста.
 */
function started<T>(out: T): T {
  if (out !== null && typeof out === 'object' && 'then' in out && typeof out.then === 'function') {
    const thenable = out as PromiseLike<unknown>;
    return new Promise((resolve, reject) => {
      thenable.then(resolve, reject);
    }) as T;
  }
  return out;
}

/**
 * Откриването преди вход (`db/discovery.ts`) може да не намери клиент: тогава `fn` тече БЕЗ контекст
 * — базата не връща редове и отговорът е същият като за непознат (не издава какво съществува).
 */
export function withTenantIfKnown<T>(tenantId: string | null, fn: () => T): T {
  return tenantId === null ? fn() : withTenant(tenantId, fn);
}
