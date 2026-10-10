import type { PrismaClient } from '@prisma/client';

/**
 * Проверката при старт: ролята на приложението НЕ бива да заобикаля RLS — иначе изолацията в базата
 * е само на хартия. Заобикалят я: superuser, BYPASSRLS и собственикът на таблиците (или член на
 * неговата роля — PostgreSQL третира наследеното като собственост). Връща причината или null.
 */

export type RlsRoleProblem = 'superuser' | 'bypassrls' | 'table_owner' | 'rls_disabled';

export async function rlsRoleProblem(db: PrismaClient): Promise<RlsRoleProblem | null> {
  const rows = await db.$queryRaw<
    Array<{ superuser: boolean; bypass: boolean; owner: boolean; rls: boolean }>
  >`SELECT r.rolsuper AS superuser, r.rolbypassrls AS bypass,
           pg_has_role(current_user, c.relowner, 'USAGE') AS owner,
           c.relrowsecurity AS rls
      FROM pg_roles r, pg_class c
     WHERE r.rolname = current_user AND c.oid = '"Case"'::regclass`;
  const row = rows[0];
  if (!row) return 'rls_disabled';
  if (row.superuser) return 'superuser';
  if (row.bypass) return 'bypassrls';
  if (row.owner) return 'table_owner';
  if (!row.rls) return 'rls_disabled';
  return null;
}

/**
 * В продукция (strict) процесът НЕ тръгва с роля, която заобикаля RLS (fail-closed). Извън нея
 * (разработка, тестове с ролята на собственика) — само предупреждение.
 */
export async function assertRlsRole(
  db: PrismaClient,
  opts: { strict: boolean; warn: (o: object, msg: string) => void },
): Promise<void> {
  const problem = await rlsRoleProblem(db);
  if (problem === null) return;
  if (opts.strict) {
    throw new Error(
      `Ролята на базата заобикаля изолацията на клиентите (${problem}) — DATABASE_URL трябва да е ` +
        'chatchat_app (DEPLOY.md, „Роли на базата“).',
    );
  }
  opts.warn({ problem }, 'ролята на базата заобикаля RLS — само за разработка/тестове');
}
