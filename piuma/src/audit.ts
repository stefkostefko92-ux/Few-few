import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import {
  ANCHOR_FILE,
  anchorBreak,
  readAnchor,
  saveAnchor,
  type AnchorPoint,
} from './audit-anchor.js';
import {
  AUDIT_VERSION,
  CHAIN_START,
  canonicalJson,
  deriveChainKeys,
  ipTag,
  rowHash,
  verifyRows,
  type ChainKeys,
} from './audit-chain.js';
import { config, isProduction } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';

export { canonicalJson } from './audit-chain.js';

export type ActorType = 'HUMAN' | 'AGENT' | 'SYSTEM';

export interface AuditActor {
  type: ActorType;
  id: string | null;
  label: string;
  ip?: string | null;
}

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

let cachedKeys: ChainKeys | null = null;
/** Изведени от TOKEN_ENC_KEY (domain separation „audit-chain-v2“) — без нова задължителна тайна. */
function keys(): ChainKeys {
  cachedKeys ??= deriveChainKeys(config().TOKEN_ENC_KEY);
  return cachedKeys;
}

/** Файлът на котвата или null, ако AUDIT_ANCHOR_DIR не е зададена (котвата е изключена). */
function anchorFile(): string | null {
  const dir = config().AUDIT_ANCHOR_DIR;
  return dir ? join(dir, ANCHOR_FILE) : null;
}

let anchorWarned = false;
async function anchorAt(point: AnchorPoint): Promise<void> {
  const file = anchorFile();
  if (!file) return;
  try {
    await saveAnchor(file, point);
  } catch (error) {
    if (!anchorWarned) {
      logger.error(
        { err: error instanceof Error ? error.message : error },
        'котвата на одита не се записа',
      );
    }
    anchorWarned = true;
  }
}

/**
 * Tamper-evident верига v2: hash = HMAC(ключ извън базата; prevHash | at | извършител | действие |
 * цел | detail | HMAC(ip)). Записите се пишат последователно в транзакция, за да е стабилен
 * `prevHash`; след commit главата отива в котвата извън базата.
 */
export async function audit(actor: AuditActor, entry: AuditEntry): Promise<void> {
  const detailJson = entry.detail ? canonicalJson(entry.detail) : null;
  const head = await prisma.$transaction(async (tx) => {
    // Един писач наведнъж: без ключалката два паралелни записа четат същия prevHash и веригата се разклонява.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7241001)`;
    const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? '';
    const fields = {
      at: new Date(),
      actorType: actor.type,
      actorId: actor.id,
      actorLabel: actor.label,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      detail: detailJson ? (JSON.parse(detailJson) as Prisma.InputJsonValue) : null,
      ip: actor.ip ?? null,
      ipTag: ipTag(actor.ip, keys()),
    };
    const hash = rowHash(prevHash, fields, AUDIT_VERSION, keys());
    return tx.auditLog.create({
      data: {
        ...fields,
        detail: fields.detail ?? undefined,
        prevHash,
        hash,
        v: AUDIT_VERSION,
      },
      select: { id: true, hash: true },
    });
  });
  await anchorAt(head);
}

export interface ChainState {
  ok: boolean;
  brokenAt: number | null;
  count: number;
  head: AnchorPoint | null;
}

const BATCH = 1000;
let reportedBreak: number | null = null;

/**
 * Пълна проверка на веригата на партиди. Хваща подменен или пропуснат запис, v1 след v2 (пресметнато
 * наново без ключ) и — с котвата извън базата — изрязан край или пренаписана опашка.
 */
export async function verifyAuditChain(): Promise<ChainState> {
  // Котвата — ПРЕДИ базата: тя сочи само записи след commit, затова сканирането след нея ги вижда.
  const file = anchorFile();
  const anchor = file ? readAnchor(file) : null;
  let cursor = CHAIN_START;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: { id: { gt: cursor.lastId } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    const step = verifyRows(cursor, rows, keys());
    if (step.brokenAt !== null) return broken(step.brokenAt);
    cursor = step.cursor;
    if (rows.length < BATCH) break;
  }
  const atAnchor = anchor
    ? await prisma.auditLog.findUnique({ where: { id: anchor.id }, select: { hash: true } })
    : null;
  const breakAt = anchorBreak(anchor, { lastId: cursor.lastId, headHash: atAnchor?.hash ?? null });
  if (breakAt !== null) return broken(breakAt);
  const head = cursor.lastId ? { id: cursor.lastId, hash: cursor.prevHash } : null;
  return { ok: true, brokenAt: null, count: cursor.count, head };
}

async function broken(brokenAt: number): Promise<ChainState> {
  logger.error({ brokenAt }, 'одитната верига е скъсана');
  return { ok: false, brokenAt, count: await prisma.auditLog.count(), head: null };
}

const CHECK_ACTOR: AuditActor = { type: 'SYSTEM', id: null, label: 'проверка на одита' };

/**
 * Планираната пълна проверка (работникът, всеки час). Цяла верига → главата отива в котвата и в лога
 * (второ копие извън базата). Скъсана → грешка в лога и одит запис, по един на място на скъсване.
 */
export async function runAuditCheck(): Promise<ChainState> {
  const chain = await verifyAuditChain();
  if (chain.ok) {
    if (chain.head) await anchorAt(chain.head);
    if (!anchorFile() && isProduction()) {
      logger.warn('котвата на одита е изключена (AUDIT_ANCHOR_DIR) — изрязан край няма да се види');
    }
    logger.info({ auditHead: chain.head, auditEntries: chain.count }, 'проверка на одит-веригата');
    return chain;
  }
  if (reportedBreak !== chain.brokenAt) {
    reportedBreak = chain.brokenAt;
    await audit(CHECK_ACTOR, {
      action: 'audit.chain.broken',
      targetType: 'AuditLog',
      targetId: String(chain.brokenAt),
      detail: { brokenAt: chain.brokenAt, count: chain.count },
    });
  }
  return chain;
}
