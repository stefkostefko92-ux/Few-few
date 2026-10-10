import type { PrismaClient } from '@prisma/client';
import { canonicalJson } from '../audit.js';
import { sha256 } from '../crypto.js';
import { extractIdentifiers } from '../domain/normalize.js';
import { refreshChunkIndex } from '../store/knowledge.js';
import { effectiveRangeOk, type DocumentInput } from './document-meta.js';

export * from './document-meta.js';

/**
 * Приемане на документ (§7.3): администраторът на знанието подава задължителните метаданни (§7.2)
 * и или вече извлечения текст по страници, или чист PDF, качен като прикачен файл (антивирус →
 * текст по страници в routes/admin-documents). С PDF checksum е sha256 на оригиналния файл (§7.2);
 * с подаден текст — на подаденото съдържание. Документът влиза като DRAFT и AI не го вижда до
 * публикуване. Метаданните и проверките им — `document-meta.ts`.
 */

/** Страница без текст (сканиран PDF — OCR не правим): предупреждение към качилия, не грешка. */
export function pageWarnings(
  pages: ReadonlyArray<{ page: number; text: string }>,
): Array<{ code: 'ingest.pageWithoutText'; page: number }> {
  return pages
    .filter((p) => p.text.trim() === '')
    .map((p) => ({ code: 'ingest.pageWithoutText' as const, page: p.page }));
}

const CHUNK_CHARS = 1200;

export interface ChunkDraft {
  ordinal: number;
  page: number;
  section: string | null;
  text: string;
}

/**
 * Парчета по страница и абзац (§7.3 „chunking per sezione, tabella e pagina“): никога през
 * граница на страница — цитатът трябва да сочи една страница.
 */
export function chunkPages(pages: DocumentInput['pages']): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  for (const p of [...pages].sort((a, b) => a.page - b.page)) {
    const paragraphs = p.text
      .split(/\n\s*\n/)
      .map((x) => x.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean);
    let buffer = '';
    const flush = () => {
      if (!buffer) return;
      chunks.push({
        ordinal: chunks.length,
        page: p.page,
        section: p.section ?? null,
        text: buffer,
      });
      buffer = '';
    };
    for (const para of paragraphs) {
      if (buffer && buffer.length + para.length + 2 > CHUNK_CHARS) flush();
      if (para.length > CHUNK_CHARS) {
        for (let i = 0; i < para.length; i += CHUNK_CHARS) {
          buffer = para.slice(i, i + CHUNK_CHARS);
          flush();
        }
        continue;
      }
      buffer = buffer ? `${buffer}\n\n${para}` : para;
    }
    flush();
  }
  return chunks;
}

export type IngestError =
  | { code: 'unknown_product'; models: string[] }
  | { code: 'device_not_found'; serials: string[] }
  | { code: 'invalid_input'; field: 'effectiveTo' }
  | { code: 'duplicate_revision' }
  | { code: 'superseded_not_found' }
  | { code: 'empty_document' };

/**
 * Таблата от правилата (уникалните схеми): сериен номер → id, само в клиента и само ако моделът
 * на правилото е моделът на таблото (HW, ако е посочена — също неговата).
 */
async function resolveDevices(
  db: PrismaClient,
  tenantId: string,
  rules: DocumentInput['applicability'],
): Promise<{ ok: true; ids: Map<string, string> } | { ok: false; serials: string[] }> {
  const serials = [...new Set(rules.flatMap((r) => (r.deviceSerial ? [r.deviceSerial] : [])))];
  if (serials.length === 0) return { ok: true, ids: new Map() };
  const devices = await db.device.findMany({
    where: { tenantId, serial: { in: serials } },
    include: { revision: { include: { product: true } } },
  });
  const bySerial = new Map(devices.map((d) => [d.serial, d]));
  const bad = new Set<string>();
  for (const r of rules) {
    if (!r.deviceSerial) continue;
    const d = bySerial.get(r.deviceSerial);
    const hwOk =
      !r.hwRevision || r.hwRevision.trim().toUpperCase() === d?.revision.hwRevision.toUpperCase();
    if (!d || d.revision.product.model !== r.productModel || !hwOk) bad.add(r.deviceSerial);
  }
  if (bad.size > 0) return { ok: false, serials: [...bad] };
  return { ok: true, ids: new Map(devices.map((d) => [d.serial, d.id])) };
}

export async function ingestDocument(
  db: PrismaClient,
  tenantId: string,
  uploadedById: string,
  input: DocumentInput,
  /** sha256 на оригиналния файл (PDF); без него — на подаденото съдържание. */
  opts: { checksum?: string } = {},
): Promise<{ ok: true; documentId: string; chunks: number } | { ok: false; error: IngestError }> {
  const models = [...new Set(input.applicability.map((a) => a.productModel))];
  const products = await db.product.findMany({ where: { tenantId, model: { in: models } } });
  const byModel = new Map(products.map((p) => [p.model, p.id]));
  const unknown = models.filter((m) => !byModel.has(m));
  if (unknown.length > 0) return { ok: false, error: { code: 'unknown_product', models: unknown } };
  if (!effectiveRangeOk(input)) {
    return { ok: false, error: { code: 'invalid_input', field: 'effectiveTo' } };
  }
  const devices = await resolveDevices(db, tenantId, input.applicability);
  if (!devices.ok) {
    return { ok: false, error: { code: 'device_not_found', serials: devices.serials } };
  }

  const exists = await db.document.findUnique({
    where: { tenantId_code_revision: { tenantId, code: input.code, revision: input.revision } },
  });
  if (exists) return { ok: false, error: { code: 'duplicate_revision' } };

  let supersedesId: string | null = null;
  if (input.supersedesRevision) {
    const prev = await db.document.findUnique({
      where: {
        tenantId_code_revision: { tenantId, code: input.code, revision: input.supersedesRevision },
      },
    });
    if (!prev) return { ok: false, error: { code: 'superseded_not_found' } };
    supersedesId = prev.id;
  }

  const chunks = chunkPages(input.pages);
  if (chunks.length === 0) return { ok: false, error: { code: 'empty_document' } };
  const identifiers = chunks.map((c) => extractIdentifiers(`${c.section ?? ''} ${c.text}`));
  const known = new Set(
    (
      await db.errorCode.findMany({
        where: {
          tenantId,
          productId: { in: [...byModel.values()] },
          code: { in: [...new Set(identifiers.flat())] },
        },
        select: { code: true },
      })
    ).map((e) => e.code),
  );

  const document = await db.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        tenantId,
        code: input.code,
        title: input.title,
        type: input.type,
        language: input.language,
        revision: input.revision,
        audience: input.audience,
        safetyRelevant: input.safetyRelevant,
        subsystem: input.subsystem ?? null,
        sourceFilename: input.sourceFilename,
        checksum: opts.checksum ?? sha256(canonicalJson(input.pages)),
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        uploadedById,
        supersedesId,
        applicability: {
          create: input.applicability.map((a) => ({
            productId: byModel.get(a.productModel) as string,
            hwRevision: a.hwRevision ?? null,
            fwMin: a.fwMin ?? null,
            fwMax: a.fwMax ?? null,
            allFirmware: a.allFirmware === true,
            deviceId: a.deviceSerial ? (devices.ids.get(a.deviceSerial) ?? null) : null,
          })),
        },
      },
    });
    await tx.documentChunk.createMany({
      data: chunks.map((c, i) => ({
        documentId: doc.id,
        ordinal: c.ordinal,
        page: c.page,
        section: c.section,
        text: c.text,
        componentRefs: identifiers[i] ?? [],
        errorCodes: (identifiers[i] ?? []).filter((id) => known.has(id)),
      })),
    });
    return doc;
  });
  await refreshChunkIndex(db, document.id);
  return { ok: true, documentId: document.id, chunks: chunks.length };
}
