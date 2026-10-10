import type { IngestBatch, IngestItem, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { appendAudit } from '../audit.js';
import { effectiveRangeOk } from '../services/document-meta.js';
import type { JobBus } from '../queue/inline.js';
import { jobId } from '../queue/jobs.js';
import { formatOfMime } from './formats.js';
import { ItemMetaSchema } from './items.js';
import { retryable } from './views.js';
import { ManifestInput, parseManifest, type ManifestIssue, type ManifestRow } from './manifest.js';

/**
 * Пакетното качване (§4.1 „importazione batch“): общите метаданни (продукт/табло/фърмуер, език,
 * вид, валидност…) + по избор манифест по файл + изричните полета на файла. Всеки файл се
 * проверява ПРИ ДОБАВЯНЕ със същата схема като единичното качване (ItemMetaSchema = §7.2) и влиза
 * в опашката; провал на един файл не спира пакета. Всичко е по клиент (tenantId във всяка заявка).
 */

const Id = z.string().min(1).max(40);

/** Общите метаданни — всяко поле по избор (файлът/манифестът ги допълва). */
export const BatchDefaults = ItemMetaSchema.partial();

export const CreateBatchBody = z
  .object({
    defaults: BatchDefaults,
    manifest: ManifestInput.optional(),
    importErrorCodes: z.boolean().optional(),
  })
  .strict();

/** Изричните полета на един файл (най-висок приоритет) — обикновено код/заглавие/ревизия. */
export const AddItemBody = z
  .object({
    attachmentId: Id,
    code: z.string().trim().min(1).max(60).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    revision: z.string().trim().min(1).max(20).optional(),
    supersedesRevision: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

export type AddItemInput = z.infer<typeof AddItemBody>;

export type BatchError =
  | { status: 400; code: 'invalid_manifest'; issues: ManifestIssue[] }
  | { status: 400; code: 'invalid_input'; issues: Array<{ path: string; message: string }> }
  | { status: 404; code: 'not_found' }
  | { status: 409; code: 'duplicate' | 'invalid_transition' | 'source_missing' }
  | { status: 415; code: 'unsupported_type' }
  | { status: 422; code: 'invalid_attachment' }
  | { status: 503; code: 'ingest_unavailable' };

type Result<T> = { ok: true; value: T } | { ok: false; error: BatchError };

const fail = (error: BatchError): { ok: false; error: BatchError } => ({ ok: false, error });

export async function createBatch(
  db: PrismaClient,
  actor: { tenantId: string; userId: string },
  body: z.infer<typeof CreateBatchBody>,
): Promise<Result<IngestBatch>> {
  let manifest: Array<{ file: string; meta: ManifestRow }> | null = null;
  if (body.manifest) {
    const parsed = parseManifest(body.manifest);
    if (!parsed.ok) return fail({ status: 400, code: 'invalid_manifest', issues: parsed.issues });
    manifest = [...parsed.rows].map(([file, meta]) => ({ file, meta }));
  }
  const batch = await db.ingestBatch.create({
    data: {
      tenantId: actor.tenantId,
      createdById: actor.userId,
      defaults: body.defaults as Prisma.InputJsonValue,
      ...(manifest ? { manifest: manifest as unknown as Prisma.InputJsonValue } : {}),
      importErrorCodes: body.importErrorCodes === true,
    },
  });
  await appendAudit(db, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    action: 'kb.ingest.batch',
    objectType: 'ingest_batch',
    objectId: batch.id,
    detail: { manifestRows: manifest?.length ?? 0, importErrorCodes: batch.importErrorCodes },
  });
  return { ok: true, value: batch };
}

/** Кодът по подразбиране от името на файла (без разширението; само [A-Za-z0-9._-]). */
export function codeFromName(name: string, fallback: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const code = base
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return code.length >= 2 ? code : fallback;
}

/** Заглавието по подразбиране: името без разширението (или цялото, ако без него е твърде късо). */
export function titleFromName(name: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, '').trim();
  return (base.length >= 2 ? base : name).slice(0, 200);
}

function manifestRowFor(batch: IngestBatch, fileName: string): ManifestRow {
  const rows = Array.isArray(batch.manifest) ? batch.manifest : [];
  for (const r of rows) {
    if (r && typeof r === 'object' && !Array.isArray(r) && r.file === fileName) {
      const meta = (r as { meta?: unknown }).meta;
      return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as ManifestRow) : {};
    }
  }
  return {};
}

const asObject = (v: Prisma.JsonValue): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * Добавя файл: CLEAN документ за базата знания от клиента, поддържан формат, окончателните
 * метаданни минават §7.2 — тогава QUEUED + задача `ingest-<id>` (идемпотентно). Без опашка (Redis
 * недостъпен) файлът е FAILED и 503 — администраторът го пуска наново с „Повтори“.
 */
export async function addItem(
  db: PrismaClient,
  bus: Pick<JobBus, 'enqueue'>,
  actor: { tenantId: string; userId: string },
  batchId: string,
  input: AddItemInput,
): Promise<Result<IngestItem>> {
  const batch = await db.ingestBatch.findFirst({
    where: { id: batchId, tenantId: actor.tenantId },
  });
  if (!batch) return fail({ status: 404, code: 'not_found' });
  const attachment = await db.attachment.findFirst({
    where: { id: input.attachmentId, tenantId: actor.tenantId },
  });
  if (
    !attachment ||
    attachment.kind !== 'DOCUMENT' ||
    attachment.scanStatus !== 'CLEAN' ||
    attachment.conversationId !== null
  ) {
    return fail({ status: 422, code: 'invalid_attachment' });
  }
  const format = formatOfMime(attachment.mime);
  if (!format) return fail({ status: 415, code: 'unsupported_type' });
  const exists = await db.ingestItem.findFirst({
    where: { batchId: batch.id, attachmentId: attachment.id },
    select: { id: true },
  });
  if (exists) return fail({ status: 409, code: 'duplicate' });

  const { attachmentId: _ignored, ...explicit } = input;
  const merged = {
    ...asObject(batch.defaults),
    ...manifestRowFor(batch, attachment.originalName),
    ...Object.fromEntries(Object.entries(explicit).filter(([, v]) => v !== undefined)),
  };
  const candidate = {
    ...merged,
    code:
      merged.code ?? codeFromName(attachment.originalName, `doc-${attachment.sha256.slice(0, 8)}`),
    title: merged.title ?? titleFromName(attachment.originalName),
  };
  const meta = ItemMetaSchema.safeParse(candidate);
  if (!meta.success) {
    return fail({
      status: 400,
      code: 'invalid_input',
      issues: meta.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (!effectiveRangeOk(meta.data)) {
    return fail({
      status: 400,
      code: 'invalid_input',
      issues: [{ path: 'effectiveTo', message: 'effectiveTo е преди effectiveFrom' }],
    });
  }
  const item = await db.ingestItem.create({
    data: {
      tenantId: actor.tenantId,
      batchId: batch.id,
      attachmentId: attachment.id,
      fileName: attachment.originalName,
      format,
      meta: meta.data as unknown as Prisma.InputJsonValue,
    },
  });
  await appendAudit(db, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    action: 'kb.ingest.enqueue',
    objectType: 'ingest',
    objectId: item.id,
    detail: { batchId: batch.id, attachmentId: attachment.id, format },
  });
  return enqueueItem(db, bus, item);
}

async function enqueueItem(
  db: PrismaClient,
  bus: Pick<JobBus, 'enqueue'>,
  item: IngestItem,
): Promise<Result<IngestItem>> {
  try {
    await bus.enqueue(
      'ingest',
      { itemId: item.id },
      { jobId: jobId('ingest', item.id, item.retries) },
    );
    return { ok: true, value: item };
  } catch {
    await db.ingestItem.updateMany({
      where: { id: item.id, status: 'QUEUED' },
      data: { status: 'FAILED', errorCode: 'ingest.err.queueUnavailable', finishedAt: new Date() },
    });
    return fail({ status: 503, code: 'ingest_unavailable' });
  }
}

/**
 * Повторно пускане (нов id на задачата `…-r<n>`): провален файл или заседнал в опашката (изгубена
 * задача, views.ts STUCK_AFTER_MS); източникът трябва да е жив.
 */
export async function retryItem(
  db: PrismaClient,
  bus: Pick<JobBus, 'enqueue'>,
  actor: { tenantId: string; userId: string },
  itemId: string,
): Promise<Result<IngestItem>> {
  const item = await db.ingestItem.findFirst({ where: { id: itemId, tenantId: actor.tenantId } });
  if (!item) return fail({ status: 404, code: 'not_found' });
  if (!item.attachmentId) return fail({ status: 409, code: 'source_missing' });
  if (!retryable(item)) return fail({ status: 409, code: 'invalid_transition' });
  // Условно по статуса И по последната промяна — паралелен повторен опит минава само веднъж.
  const moved = await db.ingestItem.updateMany({
    where: { id: item.id, status: item.status, updatedAt: item.updatedAt },
    data: {
      status: 'QUEUED',
      retries: { increment: 1 },
      errorCode: null,
      warnings: [],
      stage: null,
      progress: 0,
      finishedAt: null,
    },
  });
  if (moved.count === 0) return fail({ status: 409, code: 'invalid_transition' });
  const fresh = await db.ingestItem.findUniqueOrThrow({ where: { id: item.id } });
  await appendAudit(db, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    action: 'kb.ingest.retry',
    objectType: 'ingest',
    objectId: item.id,
    detail: { batchId: item.batchId, retries: fresh.retries },
  });
  return enqueueItem(db, bus, fresh);
}
