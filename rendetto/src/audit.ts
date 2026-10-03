import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { config, isProduction } from './config.js';
import { hmacHex } from './crypto.js';
import { prisma } from './db.js';
import { LABEL } from './labels.js';
import { logger } from './logger.js';
import { fromRoot } from './paths.js';

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

/** Версията на веригата за новите записи: HMAC с ключ, който не е в базата. */
export const AUDIT_VERSION = 2;

let chainKey: string | null = null;
function key(): string {
  chainKey ??= hmacHex(config().HMAC_KEY, 'audit-chain-v2');
  return chainKey;
}

/**
 * v1 — SHA-256 (записите отпреди ключа); v2 — HMAC-SHA-256 с ключ, изведен от HMAC_KEY: който пише
 * само в базата, не може да пресметне верига наново, за да скрие подмяна.
 */
export function auditDigest(
  parts: Array<string | number | null | undefined>,
  v = AUDIT_VERSION,
): string {
  const data = parts
    .map((part) => (part === null || part === undefined ? '' : String(part)))
    .join('|');
  return v === 1
    ? createHash('sha256').update(data).digest('hex')
    : createHmac('sha256', key()).update(data).digest('hex');
}

/** HMAC на IP адреса — влиза във веригата вместо самия адрес, който поддръжката заличава след срока. */
export function auditIpHmac(ip: string | null | undefined): string | null {
  return ip ? hmacHex(config().HMAC_KEY, `audit-ip:${ip}`) : null;
}

interface ChainRow {
  at: Date;
  actorType: string;
  actorId: string | null;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipHmac: string | null;
}

/** Полетата на записа във веригата; v2 пази и името на извършителя — кой е направил действието. */
function chainParts(prevHash: string, row: ChainRow, detailJson: string | null, v: number) {
  const who = v === 1 ? [row.actorType, row.actorId] : [row.actorType, row.actorId, row.actorLabel];
  return [
    prevHash,
    row.at.toISOString(),
    ...who,
    row.action,
    row.targetType,
    row.targetId,
    detailJson,
    row.ipHmac,
  ];
}

/* ------------------------------ котва извън базата ------------------------------ */

interface Anchor {
  head: { id: number; hash: string } | null;
  base: { id: number; hash: string } | null;
}

/**
 * Котвата е файл на сървъра извън базата: последният запис (и началото след изтриване по срок). Изтрит
 * край на веригата или подменено начало в базата не съвпада с нея. По подразбиране — само в продукция.
 */
function anchorFile(): string | null {
  const path = config().AUDIT_ANCHOR_PATH ?? (isProduction() ? 'data/audit-head.json' : null);
  return path ? fromRoot(path) : null;
}

export function readAnchor(): Anchor | null {
  const file = anchorFile();
  if (!file || !existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Anchor>;
    const point = (p: unknown) =>
      p &&
      typeof p === 'object' &&
      Number.isInteger((p as { id: unknown }).id) &&
      typeof (p as { hash: unknown }).hash === 'string'
        ? { id: (p as { id: number }).id, hash: (p as { hash: string }).hash }
        : null;
    return { head: point(raw.head), base: point(raw.base) };
  } catch {
    return null;
  }
}

let writing: Promise<void> = Promise.resolve();
let warned = false;

/** Записва котвата атомно (временен файл и преименуване), само напред по номер на записа. */
function saveAnchor(change: Partial<Anchor>): Promise<void> {
  const file = anchorFile();
  if (!file) return Promise.resolve();
  writing = writing
    .then(() => {
      const current = readAnchor() ?? { head: null, base: null };
      if (change.head && current.head && current.head.id >= change.head.id) return;
      const next = { ...current, ...change };
      writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    })
    .catch((error: unknown) => {
      if (!warned) logger.error({ err: (error as Error).message }, 'котвата на одита не се записа');
      warned = true;
    });
  return writing;
}

/* ------------------------------------ запис ------------------------------------ */

/**
 * Верига, която издава подправяне: hash = HMAC(prevHash | at | извършител | действие | цел | detail |
 * HMAC(ip)). Записите се пишат един по един под advisory lock, за да е стабилен `prevHash`.
 */
export async function audit(actor: AuditActor, entry: AuditEntry): Promise<void> {
  const detailJson = entry.detail ? canonicalJson(entry.detail) : null;
  const ipHmac = auditIpHmac(actor.ip);
  const written = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7241020)`;
    const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const base = last ? null : await tx.auditBase.findUnique({ where: { id: 1 } });
    const prevHash = last?.hash ?? base?.lastHash ?? '';
    const row: ChainRow = {
      at: new Date(),
      actorType: actor.type,
      actorId: actor.id,
      actorLabel: actor.label,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      ipHmac,
    };
    const hash = auditDigest(chainParts(prevHash, row, detailJson, AUDIT_VERSION));
    return tx.auditLog.create({
      data: {
        ...row,
        detail: detailJson ? (JSON.parse(detailJson) as Prisma.InputJsonValue) : undefined,
        ip: actor.ip ?? null,
        prevHash,
        hash,
        v: AUDIT_VERSION,
      },
      select: { id: true, hash: true },
    });
  });
  await saveAnchor({ head: written });
}

/* ---------------------------------- проверка ---------------------------------- */

export interface ChainState {
  ok: boolean;
  brokenAt: number | null;
  count: number;
  head: { id: number; hash: string } | null;
}

const BATCH = 1000;
/** Докъде веригата е проверена в този процес — панелът чете само записите след тази точка. */
let checkpoint: { id: number; hash: string; count: number; v2: boolean } | null = null;
/** Скъсана веднъж — остава скъсана до рестарт на процеса: тревогата не изчезва сама. */
let brokenAt: number | null = null;

async function broken(id: number): Promise<ChainState> {
  if (brokenAt === null) {
    brokenAt = id;
    logger.error({ brokenAt }, 'одитната верига е скъсана');
  }
  return { ok: false, brokenAt, count: await prisma.auditLog.count(), head: null };
}

/**
 * Проверява веригата на партиди. Панелът проверява само новите записи след последната проверена точка;
 * поддръжката веднъж на час (`full`) минава цялата верига от началото (или от началото след изтриване
 * по срок). Хваща подменен запис, пропуснат запис, запис v1 след v2 (връщане към версия без ключ) и,
 * с котвата извън базата, изрязан край или подменено начало.
 */
export async function verifyAuditChain(options: { full?: boolean } = {}): Promise<ChainState> {
  if (brokenAt !== null) return broken(brokenAt);
  const base = await prisma.auditBase.findUnique({ where: { id: 1 } });
  const start = options.full ? null : checkpoint;
  let prevHash = start?.hash ?? base?.lastHash ?? '';
  let lastId = start?.id ?? base?.lastId ?? 0;
  let count = start?.count ?? 0;
  let sawV2 = start?.v2 ?? false;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    for (const row of rows) {
      const detailJson = row.detail === null ? null : canonicalJson(row.detail);
      const expected = auditDigest(chainParts(prevHash, row, detailJson, row.v), row.v);
      if (row.prevHash !== prevHash || row.hash !== expected || (sawV2 && row.v === 1))
        return broken(row.id);
      sawV2 ||= row.v >= 2;
      prevHash = row.hash;
      lastId = row.id;
      count += 1;
    }
    if (rows.length < BATCH) break;
  }
  const anchor = readAnchor();
  if (anchor?.head) {
    // котвата е напред от базата (изрязан край) или записът на нейния номер е друг
    if (anchor.head.id > lastId) return broken(anchor.head.id);
    const at = await prisma.auditLog.findUnique({
      where: { id: anchor.head.id },
      select: { hash: true },
    });
    if (at && at.hash !== anchor.head.hash) return broken(anchor.head.id);
    if (!at && (base?.lastId ?? 0) < anchor.head.id) return broken(anchor.head.id);
  }
  if (
    anchor?.base &&
    (!base || base.lastId !== anchor.base.id || base.lastHash !== anchor.base.hash)
  )
    return broken(anchor.base.id);
  checkpoint = { id: lastId, hash: prevHash, count, v2: sawV2 };
  return { ok: true, brokenAt: null, count, head: lastId ? { id: lastId, hash: prevHash } : null };
}

/**
 * Изтрива записите, по-стари от срока за пазене (AUDIT_RETENTION_DAYS), без да чупи веригата: последният
 * изтрит запис става начало (AuditBase и котвата). `chain` е току-що направена пълна проверка — при
 * скъсана верига не се пипа нищо (доказателството остава).
 */
export async function pruneAudit(chain: ChainState, now: Date = new Date()): Promise<number> {
  if (!chain.ok) return 0;
  const cutoff = new Date(now.getTime() - config().AUDIT_RETENTION_DAYS * 86_400_000);
  const last = await prisma.auditLog.findFirst({
    where: { at: { lt: cutoff } },
    orderBy: { id: 'desc' },
    select: { id: true, hash: true },
  });
  if (!last) return 0;
  const [, deleted] = await prisma.$transaction([
    prisma.auditBase.upsert({
      where: { id: 1 },
      create: { id: 1, lastId: last.id, lastHash: last.hash },
      update: { lastId: last.id, lastHash: last.hash, prunedAt: now },
    }),
    prisma.auditLog.deleteMany({ where: { id: { lte: last.id } } }),
  ]);
  await saveAnchor({ base: { id: last.id, hash: last.hash } });
  checkpoint = null;
  return deleted.count;
}
