import { webcrypto } from 'node:crypto';
import type {
  Attachment,
  IngestBatch,
  IngestItem,
  IngestStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { z } from 'zod';
import { appendAudit } from '../audit.js';
import { DocumentMetaSchema } from '../services/document-meta.js';
import type { AttachmentStore } from '../storage/attachments.js';
import { IngestFailure, type FailureCode, type IngestWarning } from './types.js';

/**
 * Състоянието на файл от пакета (IngestItem) и неговият източник. Всеки преход е условен по
 * текущия статус (`updateMany … where status in …`) — повторен опит или паралелен worker не
 * пишат върху DONE/FAILED (идемпотентност). Одитът — само id-та и кодове.
 */

/** Метаданните на файла — задължителните от §7.2 без името (то идва от самия файл). */
export const ItemMetaSchema = DocumentMetaSchema.omit({ sourceFilename: true });
export type ItemMeta = z.infer<typeof ItemMetaSchema>;

export type ItemWithBatch = IngestItem & { batch: IngestBatch };

const OPEN = (): { in: IngestStatus[] } => ({ in: ['QUEUED', 'RUNNING'] });

/** Поема файла за етап: само QUEUED/RUNNING (RUNNING = прекъснат опит) → RUNNING; иначе null. */
export async function claimItem(
  db: PrismaClient,
  itemId: string,
  stage: 'extract' | 'ocr',
): Promise<ItemWithBatch | null> {
  const moved = await db.ingestItem.updateMany({
    where: { id: itemId, status: OPEN() },
    data: { status: 'RUNNING', stage, progress: 0 },
  });
  if (moved.count === 0) return null;
  return db.ingestItem.findUnique({ where: { id: itemId }, include: { batch: true } });
}

export async function setStage(
  db: PrismaClient,
  itemId: string,
  data: { stage?: 'extract' | 'ocr' | 'index'; progress?: number; format?: string },
): Promise<void> {
  await db.ingestItem.updateMany({ where: { id: itemId, status: 'RUNNING' }, data });
}

/** Провал: FAILED с кода (i18n), предупрежденията до момента и одит. Повторно — без ефект. */
export async function failItem(
  db: PrismaClient,
  itemId: string,
  code: FailureCode,
  warnings: readonly IngestWarning[] = [],
): Promise<boolean> {
  const item = await db.ingestItem.findUnique({ where: { id: itemId }, include: { batch: true } });
  if (!item) return false;
  const moved = await db.ingestItem.updateMany({
    where: { id: itemId, status: OPEN() },
    data: {
      status: 'FAILED',
      errorCode: code,
      stage: null,
      finishedAt: new Date(),
      ...(warnings.length > 0 ? { warnings: warnings as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  if (moved.count === 0) return false;
  await appendAudit(db, {
    tenantId: item.tenantId,
    actorId: item.batch.createdById,
    action: 'kb.ingest.fail',
    objectType: 'ingest',
    objectId: item.id,
    detail: { batchId: item.batchId, code, format: item.format },
  });
  return true;
}

export interface Source {
  attachment: Attachment;
  bytes: Buffer;
}

/**
 * Оригиналът на файла: CLEAN документ за базата знания от СЪЩИЯ клиент (антивирусът е минал при
 * качването — преди всякакъв разбор), байтовете от частното хранилище и sha256 = записания
 * (подменен/повреден файл → отказ).
 */
export async function loadSource(
  db: PrismaClient,
  store: AttachmentStore,
  item: IngestItem,
): Promise<Source> {
  if (!item.attachmentId) throw new IngestFailure('ingest.err.sourceMissing');
  const attachment = await db.attachment.findFirst({
    where: { id: item.attachmentId, tenantId: item.tenantId },
  });
  if (
    !attachment ||
    attachment.kind !== 'DOCUMENT' ||
    attachment.scanStatus !== 'CLEAN' ||
    attachment.conversationId !== null
  ) {
    throw new IngestFailure('ingest.err.sourceMissing');
  }
  // Временна грешка на хранилището (диск) → изключение → повторен опит; липсващ файл → провал.
  const bytes = await store.get(attachment.objectKey);
  if (!bytes) throw new IngestFailure('ingest.err.sourceMissing');
  // Хешът — асинхронно (пулът от нишки), не в главната нишка: до 50 MB.
  const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
  if (digest !== attachment.sha256) {
    throw new IngestFailure('ingest.err.sourceChanged');
  }
  return { attachment, bytes };
}
