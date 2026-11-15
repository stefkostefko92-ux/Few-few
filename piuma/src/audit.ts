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
import { config } from './config.js';
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
 *
 * Под ключалката се сверява котвата: липсва ли записът на нейния номер или е с друг хеш (изрязан
 * край, пренаписана опашка), котвата НЕ се мести — иначе първият нов запис би „поправил“ следата.
 * Записът пак се пише (действието е станало), а скъсването отива в лога и в одита.
 */
export async function audit(actor: AuditActor, entry: AuditEntry): Promise<void> {
  const detailJson = entry.detail ? canonicalJson(entry.detail) : null;
  const file = anchorFile();
  const { head, anchorBroken } = await prisma.$transaction(async (tx) => {
    // Един писач наведнъж: без ключалката два паралелни записа четат същия prevHash и веригата се разклонява.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7241001)`;
    // Котвата се пише само след commit — под ключалката тя сочи запис, който вече е в базата.
    const anchor = file ? readAnchor(file) : null;
    let anchorBroken: number | null = null;
    if (anchor) {
      const atAnchor = await tx.auditLog.findUnique({
        where: { id: anchor.id },
        select: { hash: true },
      });
      if (atAnchor?.hash !== anchor.hash) anchorBroken = anchor.id;
    }
    // Първи запис с котва: заковава последния v1 номер извън базата (веднъж, после не се сменя).
    let v1MaxId = anchor?.v1MaxId;
    if (file && anchorBroken === null && v1MaxId === undefined) {
      const lastV1 = await tx.auditLog.findFirst({
        where: { v: 1 },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      v1MaxId = lastV1?.id ?? 0;
    }
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
    const created = await tx.auditLog.create({
      data: {
        ...fields,
        detail: fields.detail ?? undefined,
        prevHash,
        hash,
        v: AUDIT_VERSION,
      },
      select: { id: true, hash: true },
    });
    const head: AnchorPoint = { ...created };
    if (v1MaxId !== undefined) head.v1MaxId = v1MaxId;
    return { head, anchorBroken };
  });
  if (anchorBroken !== null) {
    await reportBreaks([anchorBroken], 'запис');
    return;
  }
  await anchorAt(head);
}

export interface ChainState {
  ok: boolean;
  /** първото място на скъсване (за екрана) */
  brokenAt: number | null;
  /** всички места на скъсване, по номер */
  breaks: number[];
  count: number;
  head: AnchorPoint | null;
}

const BATCH = 1000;

/**
 * Пълна проверка на веригата на партиди. Хваща подменен или пропуснат запис, v1 след v2 или над
 * закования v1 номер (пресметнато наново без ключ) и — с котвата извън базата — изрязан край или
 * пренаписана опашка. Не спира на първото скъсване: връща всички места.
 */
export async function verifyAuditChain(): Promise<ChainState> {
  // Котвата — ПРЕДИ базата: тя сочи само записи след commit, затова сканирането след нея ги вижда.
  const file = anchorFile();
  const anchor = file ? readAnchor(file) : null;
  const v1MaxId = config().AUDIT_V1_MAX_ID ?? anchor?.v1MaxId ?? null;
  const breaks: number[] = [];
  let cursor = CHAIN_START;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: { id: { gt: cursor.lastId } },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    const step = verifyRows(cursor, rows, keys(), v1MaxId);
    breaks.push(...step.breaks);
    cursor = step.cursor;
    if (rows.length < BATCH) break;
  }
  const atAnchor = anchor
    ? await prisma.auditLog.findUnique({ where: { id: anchor.id }, select: { hash: true } })
    : null;
  const breakAt = anchorBreak(anchor, { lastId: cursor.lastId, headHash: atAnchor?.hash ?? null });
  if (breakAt !== null && !breaks.includes(breakAt)) breaks.push(breakAt);
  breaks.sort((a, b) => a - b);
  if (breaks.length > 0) {
    logger.error(
      { breaks: breaks.slice(0, MAX_REPORTED), total: breaks.length },
      'одитната верига е скъсана',
    );
    return { ok: false, brokenAt: breaks[0]!, breaks, count: cursor.count, head: null };
  }
  const head = cursor.lastId ? { id: cursor.lastId, hash: cursor.prevHash } : null;
  return { ok: true, brokenAt: null, breaks, count: cursor.count, head };
}

const CHECK_ACTOR: AuditActor = { type: 'SYSTEM', id: null, label: 'проверка на одита' };
/** Таван на алармите от една проверка — нарочно накъсана верига не залива одита. */
const MAX_REPORTED = 20;
const reportedBreaks = new Set<number>();

/**
 * Аларма — грешка в лога и одит запис audit.chain.broken — по веднъж на място на скъсване в процеса.
 * Мястото се отбелязва ПРЕДИ записа: самият запис минава през audit(), който пак вижда скъсаната
 * котва и вика тук — отбелязаното място спира кръга.
 */
async function reportBreaks(breaks: number[], source: 'запис' | 'проверка'): Promise<void> {
  const fresh = breaks.filter((b) => !reportedBreaks.has(b)).slice(0, MAX_REPORTED);
  for (const b of fresh) reportedBreaks.add(b);
  for (const brokenAt of fresh) {
    logger.error({ brokenAt, source }, 'аларма: одитната верига е скъсана');
    await audit(CHECK_ACTOR, {
      action: 'audit.chain.broken',
      targetType: 'AuditLog',
      targetId: String(brokenAt),
      detail: { brokenAt, source, places: breaks.length },
    });
  }
}

/**
 * Планираната пълна проверка (работникът, всеки час). Цяла верига → главата отива в котвата и в лога
 * (второ копие извън базата). Скъсана → грешка в лога и одит запис, по един на място на скъсване.
 */
export async function runAuditCheck(): Promise<ChainState> {
  const chain = await verifyAuditChain();
  if (chain.ok) {
    if (chain.head) await anchorAt(chain.head);
    logger.info({ auditHead: chain.head, auditEntries: chain.count }, 'проверка на одит-веригата');
    return chain;
  }
  await reportBreaks(chain.breaks, 'проверка');
  return chain;
}
