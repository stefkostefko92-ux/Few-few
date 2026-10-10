import type { Attachment, Prisma, PrismaClient } from '@prisma/client';
import { appendAudit } from '../audit.js';
import { ingestDocument, pageWarnings, type IngestError } from '../services/ingest.js';
import type { TemplateResult, TemplateRow } from './error-template.js';
import { ItemMetaSchema, type ItemWithBatch } from './items.js';
import { IngestFailure, type Extraction, type FailureCode, type IngestWarning } from './types.js';

/**
 * Последната стъпка на файла (§7.3 т. 5–7): документът като ЧЕРНОВА със същите задължителни
 * метаданни и проверки като единичното качване (`ingestDocument`), по избор ЧЕРНОВИТЕ кодове от
 * XLSX шаблона и статусът DONE — всичко в ЕДНА транзакция (срив по средата не оставя документ без
 * статус; повторният опит вижда DONE и не прави втори). Checksum = sha256 на оригинала (§7.2).
 */

const INGEST_ERROR: Record<IngestError['code'], FailureCode> = {
  unknown_product: 'ingest.err.unknownProduct',
  device_not_found: 'ingest.err.deviceNotFound',
  invalid_input: 'ingest.err.invalidMeta',
  duplicate_revision: 'ingest.err.duplicateRevision',
  superseded_not_found: 'ingest.err.supersededNotFound',
  empty_document: 'ingest.err.emptyDocument',
};

type Tx = Prisma.TransactionClient;

interface ImportedCode {
  id: string;
  code: string;
  version: number;
}

/**
 * ЧЕРНОВИТЕ кодове от шаблона: продуктът — от реда или единственият в приложимостта на документа;
 * източникът (този документ) трябва да важи за модела (§7.3) — иначе редът е предупреждение.
 */
async function importCodes(
  tx: Tx,
  scope: { tenantId: string; documentId: string; actorId: string; models: readonly string[] },
  rows: readonly TemplateRow[],
  warnings: IngestWarning[],
): Promise<ImportedCode[]> {
  const products = await tx.product.findMany({
    where: { tenantId: scope.tenantId, model: { in: [...scope.models] } },
    select: { id: true, model: true },
  });
  const byModel = new Map(products.map((p) => [p.model, p.id]));
  const only = products.length === 1 ? products[0]?.model : undefined;
  const created: ImportedCode[] = [];
  for (const row of rows) {
    const productId = byModel.get(row.productModel ?? only ?? '');
    if (!productId) {
      warnings.push({ code: 'ingest.warn.errorRowInvalid', row: row.row });
      continue;
    }
    const latest = await tx.errorCode.findFirst({
      where: { productId, code: row.code },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const page = row.sourcePage ?? row.sheetPage;
    const code = await tx.errorCode.create({
      data: {
        tenantId: scope.tenantId,
        productId,
        code: row.code,
        title: row.title,
        description: row.description,
        subsystem: row.subsystem ?? null,
        severity: row.severity,
        safetyRelevant: row.safetyRelevant,
        hwRevision: row.hwRevision ?? null,
        fwMin: row.fwMin ?? null,
        fwMax: row.fwMax ?? null,
        version: (latest?.version ?? 0) + 1,
        sourceDocumentId: scope.documentId,
        sourcePage: page,
        authorIds: [scope.actorId],
        relations: {
          create: row.relations.map((r, i) => ({
            kind: r.kind,
            ordinal: i + 1,
            text: r.text,
            expected: null,
            actionClass: r.actionClass,
            sourceDocumentId: scope.documentId,
            sourcePage: page,
          })),
        },
      },
      select: { id: true, code: true, version: true },
    });
    created.push(code);
  }
  return created;
}

export async function finalizeItem(
  db: PrismaClient,
  item: ItemWithBatch,
  attachment: Attachment,
  extraction: Extraction,
  template: TemplateResult | null,
): Promise<{ documentId: string; chunks: number }> {
  const meta = ItemMetaSchema.safeParse(item.meta);
  if (!meta.success) throw new IngestFailure('ingest.err.invalidMeta');
  const actorId = item.batch.createdById;
  const warnings: IngestWarning[] = [
    ...extraction.warnings,
    ...(template?.warnings ?? []),
    // PDF страница, останала без текст (OCR изключен) — като при единичното качване.
    ...(extraction.format === 'pdf'
      ? pageWarnings(extraction.pages)
          .filter((w) => !extraction.warnings.some((x) => x.page === w.page))
          .map((w) => ({ code: 'ingest.warn.pageWithoutText' as const, page: w.page }))
      : []),
  ];
  let imported: ImportedCode[] = [];
  const result = await ingestDocument(
    db,
    item.tenantId,
    actorId,
    { ...meta.data, sourceFilename: attachment.originalName, pages: extraction.pages },
    {
      checksum: attachment.sha256,
      inTransaction: async (tx, documentId) => {
        if (template && item.batch.importErrorCodes) {
          const models = meta.data.applicability.map((a) => a.productModel);
          imported = await importCodes(
            tx,
            { tenantId: item.tenantId, documentId, actorId, models },
            template.rows,
            warnings,
          );
        }
        const chunks = await tx.documentChunk.count({ where: { documentId } });
        const done = await tx.ingestItem.updateMany({
          where: { id: item.id, status: 'RUNNING' },
          data: {
            status: 'DONE',
            stage: null,
            progress: 100,
            documentId,
            chunks,
            pages: extraction.pages.length,
            ocrPages: extraction.ocrPages,
            errorCodes: imported.length,
            warnings: warnings as unknown as Prisma.InputJsonValue,
            finishedAt: new Date(),
          },
        });
        // Друг опит е стигнал до края пръв — този документ не се записва (транзакцията пада).
        if (done.count === 0) throw new IngestFailure('ingest.err.internal');
      },
    },
  );
  if (!result.ok) throw new IngestFailure(INGEST_ERROR[result.error.code]);

  // Одитът — след commit (веригата е под свой advisory lock): само id-та, кодове и броеве.
  await appendAudit(db, {
    tenantId: item.tenantId,
    actorId,
    action: 'kb.document.upload',
    objectType: 'document',
    objectId: result.documentId,
    detail: {
      code: meta.data.code,
      revision: meta.data.revision,
      chunks: result.chunks,
      sourceAttachmentId: attachment.id,
      boardSpecific: meta.data.applicability.some((a) => a.deviceSerial !== undefined),
      ingestItemId: item.id,
      format: extraction.format,
      ocrPages: extraction.ocrPages,
    },
  });
  for (const code of imported) {
    await appendAudit(db, {
      tenantId: item.tenantId,
      actorId,
      action: 'kb.error.create',
      objectType: 'error',
      objectId: code.id,
      detail: { code: code.code, version: code.version, importedFrom: result.documentId },
    });
  }
  return { documentId: result.documentId, chunks: result.chunks };
}
