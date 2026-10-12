import type { IngestItem, IngestStatus, PrismaClient } from '@prisma/client';

/**
 * Файл, „заседнал“ в QUEUED/RUNNING без промяна толкова време (изгубена задача — напр. Redis без
 * данни), може да се пусне наново. Истинската работа обновява напредъка си (OCR — по страница).
 */
export const STUCK_AFTER_MS = 30 * 60 * 1000;

/** Може ли файлът да се пусне наново: провален, или заседнал — и оригиналът е още тук. */
export function retryable(
  i: Pick<IngestItem, 'status' | 'attachmentId' | 'updatedAt'>,
  now = Date.now(),
) {
  if (i.attachmentId === null) return false;
  if (i.status === 'FAILED') return true;
  return (
    (i.status === 'QUEUED' || i.status === 'RUNNING') &&
    now - i.updatedAt.getTime() > STUCK_AFTER_MS
  );
}

/**
 * Какво вижда администраторът на знанието за пакета: статусът/етапът/напредъкът на всеки файл,
 * кодът на грешката (i18n) и предупрежденията, документът-чернова. Без метаданните на файла и без
 * съдържание; всичко по клиент.
 */

export function itemView(i: IngestItem) {
  return {
    id: i.id,
    fileName: i.fileName,
    format: i.format,
    status: i.status,
    stage: i.stage,
    progress: i.progress,
    errorCode: i.errorCode,
    warnings: Array.isArray(i.warnings) ? i.warnings : [],
    documentId: i.documentId,
    chunks: i.chunks,
    pages: i.pages,
    ocrPages: i.ocrPages,
    errorCodes: i.errorCodes,
    retries: i.retries,
    canRetry: retryable(i),
    createdAt: i.createdAt,
    finishedAt: i.finishedAt,
  };
}

const STATUSES: readonly IngestStatus[] = ['QUEUED', 'RUNNING', 'DONE', 'FAILED'];

function counts(items: ReadonlyArray<{ status: IngestStatus }>): Record<IngestStatus, number> {
  const out = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<IngestStatus, number>;
  for (const i of items) out[i.status] += 1;
  return out;
}

export async function batchView(db: PrismaClient, tenantId: string, batchId: string) {
  const batch = await db.ingestBatch.findFirst({
    where: { id: batchId, tenantId },
    include: { items: { orderBy: { createdAt: 'asc' }, take: 1000 } },
  });
  if (!batch) return null;
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    importErrorCodes: batch.importErrorCodes,
    manifestRows: Array.isArray(batch.manifest) ? batch.manifest.length : 0,
    counts: counts(batch.items),
    items: batch.items.map(itemView),
  };
}

/** Последните пакети на клиента с броевете по статус (за списъка). */
export async function recentBatches(db: PrismaClient, tenantId: string, limit = 20) {
  const batches = await db.ingestBatch.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { items: { select: { status: true } } },
  });
  return batches.map((b) => ({
    id: b.id,
    createdAt: b.createdAt,
    importErrorCodes: b.importErrorCodes,
    total: b.items.length,
    counts: counts(b.items),
  }));
}
