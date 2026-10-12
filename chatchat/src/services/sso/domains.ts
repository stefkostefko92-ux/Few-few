import { Prisma, type PrismaClient, type SsoDomain } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { appendAudit } from '../../audit.js';
import { releaseOtherSsoClaims, ssoDomainsTaken } from '../../db/discovery.js';

/**
 * Доказване на домейн (собственост върху DNS): само доказан домейн участва в откриването, входа,
 * първото свързване и свързването от собственика. Заявка (недоказана) не блокира никого — няколко
 * доставчика (и клиента) могат да заявят един домейн; първият доказал печели, а недоказаните заявки
 * на другите се изтриват.
 *
 * Записът: TXT на `_chatchat.<домейн>` (подчертан етикет като `_dmarc`/`_acme-challenge` — не пречи
 * на SPF и другите TXT в корена, може да се делегира с CNAME) със стойност `chatchat-verify=<токен>`.
 * Токенът се ИЗВЕЖДА (HMAC с SESSION_PEPPER) от случайния `tokenNonce` на заявката, доставчика и
 * домейна — в базата няма нито токена, нито хеша му; изтичане на базата само по себе си не дава
 * токена, а конзолата може да го покаже отново. Смяна на доставчика (издател/директория/клиент) дава
 * нов nonce → нов токен → домейнът се доказва наново.
 */

export const TXT_LABEL = '_chatchat';
export const TXT_PREFIX = 'chatchat-verify=';

export type DomainCheck = 'verified' | 'txt_missing' | 'txt_mismatch' | 'dns_error';

export function domainToken(
  pepper: string,
  row: Pick<SsoDomain, 'configId' | 'domain' | 'tokenNonce'>,
): string {
  return createHmac('sha256', pepper)
    .update(`chatchat/sso/domain-verify/v1|${row.configId}|${row.domain}|${row.tokenNonce}`)
    .digest('base64url');
}

/** Какво да сложи администраторът в DNS. */
export function txtRecord(
  pepper: string,
  row: Pick<SsoDomain, 'configId' | 'domain' | 'tokenNonce'>,
): { host: string; value: string } {
  return { host: `${TXT_LABEL}.${row.domain}`, value: `${TXT_PREFIX}${domainToken(pepper, row)}` };
}

/** Системният резолвер с таймаут (една заявка × 2 опита) — не чака безкрай чужд DNS сървър. */
export function systemTxtResolver(timeoutSeconds: number): (host: string) => Promise<string[][]> {
  const resolver = new Resolver({ timeout: timeoutSeconds * 1000, tries: 2 });
  return (host) => resolver.resolveTxt(host);
}

const MISSING = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

/**
 * Проверката: TXT записите на `_chatchat.<домейн>`. Всеки запис може да е на парчета (≤ 255 знака
 * всяко) — съединяват се. Само точно съвпадение на `chatchat-verify=<токен>` (base64url различава
 * малки и главни — не нормализираме; интервалите в края се махат).
 */
export async function checkTxt(
  resolve: (host: string) => Promise<string[][]>,
  expected: { host: string; value: string },
): Promise<DomainCheck> {
  let records: string[][];
  try {
    records = await resolve(expected.host);
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
        ? err.code
        : '';
    return MISSING.has(code) ? 'txt_missing' : 'dns_error';
  }
  const values = records.map((chunks) => chunks.join('').trim());
  if (values.includes(expected.value)) return 'verified';
  return values.some((v) => v.startsWith(TXT_PREFIX)) ? 'txt_mismatch' : 'txt_missing';
}

/** Домейнът вече е доказан от ДРУГ доставчик (който и да е клиентът). */
class DomainTaken extends Error {}

/**
 * Записва доказването (DNS или операторът през CLI) в транзакция: заявката става доказана
 * (`verifiedDomain` е уникален — паралелно доказване от друг → `taken`), недоказаните заявки на
 * другите доставчици за същия домейн се изтриват (с одит в техния клиент), одит `sso.domain_verified`.
 */
export async function commitVerification(
  db: PrismaClient,
  row: SsoDomain,
  via: 'dns' | 'cli',
  actorId: string | null,
): Promise<'verified' | 'taken'> {
  try {
    return await db.$transaction(async (tx) => {
      const done = await tx.ssoDomain.updateMany({
        where: { id: row.id, verifiedAt: null },
        data: { verifiedAt: new Date(), verifiedDomain: row.domain },
      });
      if (done.count !== 1) {
        const now = await tx.ssoDomain.findUnique({ where: { id: row.id } });
        if (now?.verifiedAt) return 'verified' as const;
        throw new DomainTaken();
      }
      // Недоказаните заявки на другите (и в други клиенти) — тясната функция; одитът е в клиента
      // на всяка изтрита заявка (администраторът му трябва да я види): контекстът на транзакцията
      // се сменя САМО за този запис и се връща. Клиентите идват от базата, никога от входа.
      const others = await releaseOtherSsoClaims(tx, row.id);
      for (const o of others) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${o.tenantId}, true)`;
        await appendAudit(tx, {
          tenantId: o.tenantId,
          actorId: null,
          action: 'sso.domain_claim_removed',
          objectType: 'sso_config',
          objectId: o.configId,
          detail: { domain: row.domain, reason: 'verified_elsewhere' },
        });
      }
      if (others.length > 0) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${row.tenantId}, true)`;
      }
      await appendAudit(tx, {
        tenantId: row.tenantId,
        actorId,
        action: 'sso.domain_verified',
        objectType: 'sso_config',
        objectId: row.configId,
        detail: { domain: row.domain, via, removedClaims: others.length },
      });
      return 'verified' as const;
    });
  } catch (err) {
    if (err instanceof DomainTaken) return 'taken';
    // Уникалният индекс на доказания домейн: друг доставчик го е доказал междувременно.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return 'taken';
    }
    throw err;
  }
}

export type VerifyOutcome = { ok: true } | { ok: false; status: number; code: string };

/**
 * Доказване през DNS от конзолата (`sso:manage`, само в своя клиент). Кодовете:
 * `sso_domain_taken` (доказан от друг), `sso_domain_txt_missing`, `sso_domain_txt_mismatch`,
 * `sso_domain_dns_error` (DNS не отговаря — опитайте пак).
 */
export async function verifyDomain(
  db: PrismaClient,
  deps: { pepper: string; resolveTxt: (host: string) => Promise<string[][]> },
  actor: { id: string; tenantId: string },
  configId: string,
  domain: string,
): Promise<VerifyOutcome> {
  const row = await db.ssoDomain.findFirst({
    where: { configId, domain, tenantId: actor.tenantId, config: { tenantId: actor.tenantId } },
  });
  if (!row) return { ok: false, status: 404, code: 'not_found' };
  if (row.verifiedAt) return { ok: true };
  // Доказан от друг доставчик (може и в друг клиент) — тясната функция, само да/не.
  if (await ssoDomainsTaken(db, [row.domain], row.configId)) {
    return { ok: false, status: 409, code: 'sso_domain_taken' };
  }
  const result = await checkTxt(deps.resolveTxt, txtRecord(deps.pepper, row));
  if (result === 'dns_error') return { ok: false, status: 502, code: 'sso_domain_dns_error' };
  if (result !== 'verified') return { ok: false, status: 422, code: `sso_domain_${result}` };
  const committed = await commitVerification(db, row, 'dns', actor.id);
  return committed === 'verified'
    ? { ok: true }
    : { ok: false, status: 409, code: 'sso_domain_taken' };
}
