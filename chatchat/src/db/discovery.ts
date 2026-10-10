import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Тесните пътища ПРЕДИ клиентът да е известен (миграцията 20261011100000): SECURITY DEFINER функции
 * в базата, които по неотгатваем ключ връщат САМО id на клиента — нищо друго от реда. След тях
 * викащият задава контекста (`withTenant`) и чете нормално, под RLS. EXECUTE има само ролята на
 * приложението; ключовете идват вече нормализирани/хеширани от викащия.
 */

type Db = PrismaClient | Prisma.TransactionClient;

type Row = Array<{ t: string | null }>;

function one(rows: Row): string | null {
  return rows[0]?.t ?? null;
}

/** Сесията по HMAC на токена от бисквитката (жива: неотнета, в срок). */
export async function tenantBySession(db: Db, tokenHash: string): Promise<string | null> {
  return one(await db.$queryRaw<Row>`SELECT chatchat_tenant_by_session(${tokenHash}) AS t`);
}

/** Входът с парола: по имейла (уникален в платформата). */
export async function tenantByEmail(db: Db, email: string): Promise<string | null> {
  return one(await db.$queryRaw<Row>`SELECT chatchat_tenant_by_email(${email}) AS t`);
}

/** Линкът за парола: по HMAC на токена (неизползван и в срок). */
export async function tenantByPasswordReset(db: Db, tokenHash: string): Promise<string | null> {
  return one(await db.$queryRaw<Row>`SELECT chatchat_tenant_by_reset(${tokenHash}) AS t`);
}

/** Единният вход: доставчикът по домейна на имейла (само включен). */
export async function tenantBySsoDomain(db: Db, domain: string): Promise<string | null> {
  return one(await db.$queryRaw<Row>`SELECT chatchat_tenant_by_sso_domain(${domain}) AS t`);
}

/** Връщането от доставчика: по HMAC на state (неизползван и в срок). */
export async function tenantBySsoState(db: Db, stateHash: string): Promise<string | null> {
  return one(await db.$queryRaw<Row>`SELECT chatchat_tenant_by_sso_state(${stateHash}) AS t`);
}

/** Входящото известие от helpdesk-а: по идентификатора в адреса (подписът — после). */
export async function tenantByHelpdeskInbound(db: Db, inboundId: string): Promise<string | null> {
  return one(
    await db.$queryRaw<Row>`SELECT chatchat_tenant_by_helpdesk_inbound(${inboundId}) AS t`,
  );
}

/** Предишният хеш на общата одитна верига (null → GENESIS) — само хеш, без съдържание. */
export async function auditPrevHash(db: Db): Promise<string | null> {
  return one(await db.$queryRaw<Row>`SELECT chatchat_audit_prev_hash() AS t`);
}
