import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { canonicalJson } from '../audit.js';
import { sha256 } from '../crypto.js';
import { extractIdentifiers } from '../domain/normalize.js';
import { isVersion } from '../domain/versions.js';
import { refreshChunkIndex } from '../store/knowledge.js';

/**
 * Приемане на документ (§7.3) в тази стъпка: администраторът на знанието подава вече извлечения
 * текст по страници + задължителните метаданни (§7.2). Извличането от PDF/DOCX и антивирусът
 * (стъпки 1–3 на §7.3) са следващата фаза — затова checksum е на подаденото съдържание.
 * Документът влиза като DRAFT и AI не го вижда до публикуване.
 */

const version = z.string().trim().max(20).refine(isVersion, 'версия като 4.2.1');

export const DocumentInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Za-z0-9._-]+$/),
  title: z.string().trim().min(2).max(200),
  type: z.enum([
    'MANUAL',
    'SCHEMATIC',
    'ERROR_LIST',
    'FAQ',
    'BULLETIN',
    'PROCEDURE',
    'SOLVED_CASE',
  ]),
  language: z.string().regex(/^[a-z]{2}$/),
  revision: z.string().trim().min(1).max(20),
  audience: z.enum(['PORTAL', 'INTERNAL', 'ENGINEERING']),
  safetyRelevant: z.boolean(),
  subsystem: z.string().trim().max(60).optional(),
  sourceFilename: z.string().trim().min(1).max(255),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
  /** Предишната ревизия на същия код, която тази заменя (отписва се при публикуване). */
  supersedesRevision: z.string().trim().min(1).max(20).optional(),
  applicability: z
    .array(
      z.object({
        productModel: z.string().trim().min(1).max(80),
        hwRevision: z.string().trim().max(20).optional(),
        fwMin: version.optional(),
        fwMax: version.optional(),
      }),
    )
    .min(1)
    .max(50),
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1).max(100000),
        section: z.string().trim().max(200).optional(),
        text: z.string().max(40000),
      }),
    )
    .min(1)
    .max(3000),
});
export type DocumentInput = z.infer<typeof DocumentInputSchema>;

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
  | { code: 'duplicate_revision' }
  | { code: 'superseded_not_found' }
  | { code: 'empty_document' };

export async function ingestDocument(
  db: PrismaClient,
  tenantId: string,
  uploadedById: string,
  input: DocumentInput,
): Promise<{ ok: true; documentId: string; chunks: number } | { ok: false; error: IngestError }> {
  const models = [...new Set(input.applicability.map((a) => a.productModel))];
  const products = await db.product.findMany({ where: { tenantId, model: { in: models } } });
  const byModel = new Map(products.map((p) => [p.model, p.id]));
  const unknown = models.filter((m) => !byModel.has(m));
  if (unknown.length > 0) return { ok: false, error: { code: 'unknown_product', models: unknown } };

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
        checksum: sha256(canonicalJson(input.pages)),
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveTo: input.effectiveTo ?? null,
        uploadedById,
        supersedesId,
        applicability: {
          create: input.applicability.map((a) => ({
            productId: byModel.get(a.productModel) as string,
            hwRevision: a.hwRevision ?? null,
            fwMin: a.fwMin ?? null,
            fwMax: a.fwMax ?? null,
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
