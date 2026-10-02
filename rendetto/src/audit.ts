import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { config } from './config.js';
import { hmacHex } from './crypto.js';
import { prisma } from './db.js';
import { LABEL } from './labels.js';

export type ActorType = 'HUMAN' | 'SYSTEM';

export interface AuditActor {
  type: ActorType;
  id: string | null;
  /** Персоналът се пише с име; клиентите — с id, без имейл (минимизация по GDPR). */
  label: string;
  ip?: string | null;
}

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

export const SYSTEM_ACTOR: AuditActor = { type: 'SYSTEM', id: null, label: LABEL.system };

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

export function auditDigest(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256')
    .update(
      parts.map((part) => (part === null || part === undefined ? '' : String(part))).join('|'),
    )
    .digest('hex');
}

/** HMAC на IP адреса — влиза във веригата вместо самия адрес, който поддръжката заличава след срока. */
export function auditIpHmac(ip: string | null | undefined): string | null {
  return ip ? hmacHex(config().HMAC_KEY, `audit-ip:${ip}`) : null;
}

/**
 * Верига, която издава подправяне: hash = SHA-256(prevHash | at | actor | action | target | detail | HMAC(ip)).
 * Записите се пишат един по един под advisory lock, за да е стабилен `prevHash`.
 */
export async function audit(actor: AuditActor, entry: AuditEntry): Promise<void> {
  const detailJson = entry.detail ? canonicalJson(entry.detail) : null;
  const ipHmac = auditIpHmac(actor.ip);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7241020)`;
    const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? '';
    const at = new Date();
    const hash = auditDigest([
      prevHash,
      at.toISOString(),
      actor.type,
      actor.id,
      entry.action,
      entry.targetType,
      entry.targetId,
      detailJson,
      ipHmac,
    ]);
    await tx.auditLog.create({
      data: {
        at,
        actorType: actor.type,
        actorId: actor.id,
        actorLabel: actor.label,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        detail: detailJson ? (JSON.parse(detailJson) as Prisma.InputJsonValue) : undefined,
        ip: actor.ip ?? null,
        ipHmac,
        prevHash,
        hash,
      },
    });
  });
}

export interface ChainState {
  ok: boolean;
  brokenAt: number | null;
  count: number;
}

const BATCH = 1000;
/** Докъде веригата е проверена в този процес — панелът чете само записите след тази точка. */
let checkpoint: { id: number; hash: string; count: number } | null = null;
let brokenAt: number | null = null;

/**
 * Проверява веригата на партиди. Панелът проверява само новите записи след последната проверена точка;
 * поддръжката веднъж на час (`full`) минава цялата верига отначало — тя хваща и подменен стар запис.
 * Скъсана верига остава скъсана, докато пълна проверка не мине чисто.
 */
export async function verifyAuditChain(options: { full?: boolean } = {}): Promise<ChainState> {
  const start = options.full ? null : checkpoint;
  if (!options.full && brokenAt !== null) {
    return { ok: false, brokenAt, count: await prisma.auditLog.count() };
  }
  let prevHash = start?.hash ?? '';
  let lastId = start?.id ?? 0;
  let count = start?.count ?? 0;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    for (const row of rows) {
      const detailJson = row.detail === null ? null : canonicalJson(row.detail);
      const expected = auditDigest([
        prevHash,
        row.at.toISOString(),
        row.actorType,
        row.actorId,
        row.action,
        row.targetType,
        row.targetId,
        detailJson,
        row.ipHmac,
      ]);
      if (row.prevHash !== prevHash || row.hash !== expected) {
        brokenAt = row.id;
        return { ok: false, brokenAt: row.id, count: await prisma.auditLog.count() };
      }
      prevHash = row.hash;
      lastId = row.id;
      count += 1;
    }
    if (rows.length < BATCH) break;
  }
  checkpoint = { id: lastId, hash: prevHash, count };
  if (options.full) brokenAt = null;
  return { ok: true, brokenAt: null, count };
}
