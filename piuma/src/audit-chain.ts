import { createHash, createHmac } from 'node:crypto';

/**
 * Чистата логика на одит-веригата — без база и без конфиг, за да се тества изцяло
 * (tests/audit-chain.test.ts). Записът и четенето от базата са в audit.ts.
 */

/** Версията на веригата за новите записи: HMAC с ключ, който не е в базата. */
export const AUDIT_VERSION = 2;

/**
 * jsonb в PostgreSQL НЕ пази реда на ключовете — затова хешираме канонична форма
 * (ключове сортирани рекурсивно), еднаква при запис и при проверка.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface ChainKeys {
  /** ключът на веригата (v2) */
  chain: Buffer;
  /** ключът за етикета на IP адреса */
  ip: Buffer;
}

/**
 * Ключовете се извеждат от сървърна тайна (TOKEN_ENC_KEY) с разделяне на домейна: нито един от тях
 * не е самата тайна, а двата не са взаимозаменяеми. Тайната е извън базата — който пише само в
 * базата, не може да пресметне веригата наново.
 */
export function deriveChainKeys(secretHex: string): ChainKeys {
  const secret = Buffer.from(secretHex, 'hex');
  return {
    chain: createHmac('sha256', secret).update('audit-chain-v2').digest(),
    ip: createHmac('sha256', secret).update('audit-ip-v2').digest(),
  };
}

/**
 * HMAC на IP адреса — влиза във веригата вместо самия адрес. Суровият `ip` може да се заличи по
 * срок (ОРЗД), без веригата да се скъса; етикетът сам по себе си не дава адреса обратно.
 */
export function ipTag(ip: string | null | undefined, keys: ChainKeys): string | null {
  return ip ? createHmac('sha256', keys.ip).update(ip).digest('hex') : null;
}

/** Полетата на записа, които влизат във веригата. */
export interface ChainFields {
  at: Date;
  actorType: string;
  actorId: string | null;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
  ip: string | null;
  ipTag: string | null;
}

export interface ChainRow extends ChainFields {
  id: number;
  prevHash: string;
  hash: string;
  v: number;
}

function detailJson(detail: unknown): string | null {
  return detail === null || detail === undefined ? null : canonicalJson(detail);
}

/**
 * v1 — SHA-256(prevHash | at | actorType | actorId | action | target | detail | ip): записите отпреди
 * ключа, формулата е дословно старата. v2 — HMAC-SHA-256 над JSON масив (без двусмислието на „|“ в
 * стойностите) с името на извършителя и етикета на IP вместо самия адрес.
 */
export function rowHash(prevHash: string, row: ChainFields, v: number, keys: ChainKeys): string {
  if (v === 1) {
    const parts = [
      prevHash,
      row.at.toISOString(),
      row.actorType,
      row.actorId,
      row.action,
      row.targetType,
      row.targetId,
      detailJson(row.detail),
      row.ip,
    ];
    return createHash('sha256')
      .update(parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|'))
      .digest('hex');
  }
  const data = JSON.stringify([
    'audit-chain-v2',
    prevHash,
    row.at.toISOString(),
    row.actorType,
    row.actorId,
    row.actorLabel,
    row.action,
    row.targetType,
    row.targetId,
    detailJson(row.detail),
    row.ipTag,
  ]);
  return createHmac('sha256', keys.chain).update(data).digest('hex');
}

/** Докъде е проверена веригата. */
export interface ChainCursor {
  prevHash: string;
  lastId: number;
  count: number;
  /** видян ли е вече запис v2 — след него v1 е връщане към версия без ключ */
  sawV2: boolean;
}

export const CHAIN_START: ChainCursor = { prevHash: '', lastId: 0, count: 0, sawV2: false };

/**
 * Проверява поредица записи (подредени по id) от `cursor` нататък. Хваща подменен запис, пропуснат
 * запис, непозната версия, v1 след v2 (пресметнато наново със SHA-256 без ключ) и подменен суров IP
 * във v2 (етикетът не съвпада). Заличен IP (null) е позволен — той не е във v2 хеша.
 */
export function verifyRows(
  cursor: ChainCursor,
  rows: Iterable<ChainRow>,
  keys: ChainKeys,
): { cursor: ChainCursor; brokenAt: number | null } {
  let { prevHash, lastId, count, sawV2 } = cursor;
  for (const row of rows) {
    const known = row.v === 1 || row.v === AUDIT_VERSION;
    const ipOk = row.v === 1 || row.ip === null || row.ipTag === ipTag(row.ip, keys);
    if (
      !known ||
      (sawV2 && row.v === 1) ||
      row.prevHash !== prevHash ||
      row.hash !== rowHash(prevHash, row, row.v, keys) ||
      !ipOk
    ) {
      return { cursor: { prevHash, lastId, count, sawV2 }, brokenAt: row.id };
    }
    sawV2 ||= row.v === AUDIT_VERSION;
    prevHash = row.hash;
    lastId = row.id;
    count += 1;
  }
  return { cursor: { prevHash, lastId, count, sawV2 }, brokenAt: null };
}
