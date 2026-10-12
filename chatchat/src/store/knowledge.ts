import { Prisma, type PrismaClient } from '@prisma/client';
import type { ActionClass } from '../domain/response.js';
import type { ApplicabilityRule } from '../domain/versions.js';
import type { ErrorCheck, KnowledgeStore, RawEvidence, SearchScope } from '../retrieval/types.js';

/**
 * KnowledgeStore върху PostgreSQL. Във ВСЯКА заявка: tenantId, status = PUBLISHED, аудитория
 * от ролята и приложимост към модела от контекста. Тези филтри са тук, не в модела и не в UI —
 * AI инструментите минават през същите методи и не могат да ги разширят.
 */

/** Думи, които не носят смисъл за пълнотекстовото търсене (IT/EN/BG). */
const STOPWORDS = new Set([
  'il', 'lo', 'la', 'le', 'gli', 'un', 'una', 'di', 'da', 'del', 'della', 'che', 'con', 'per',
  'non', 'sul', 'nel', 'come', 'cosa', 'quando', 'solo', 'dopo', 'the', 'and', 'for', 'with',
  'what', 'how', 'does', 'not', 'when', 'after', 'kak', 'и', 'на', 'за', 'да', 'се', 'не', 'от',
  'по', 'при', 'как', 'какво', 'след', 'само', 'когато',
]); // prettier-ignore

/** OR заявка за to_tsquery от думите на въпроса — само букви/цифри, нищо от синтаксиса. */
export function toOrTsQuery(text: string): string | null {
  const terms = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    terms.add(raw);
    if (terms.size >= 16) break;
  }
  return terms.size > 0 ? [...terms].join(' | ') : null;
}

const documentInclude = (productModel: string, tenantId: string) =>
  ({
    applicability: { where: { product: { model: productModel, tenantId } } },
  }) satisfies Prisma.DocumentInclude;

type DocumentWithRules = Prisma.DocumentGetPayload<{
  include: ReturnType<typeof documentInclude>;
}>;

function rulesOf(doc: DocumentWithRules): ApplicabilityRule[] {
  return doc.applicability.map((a) => ({
    hwRevision: a.hwRevision,
    fwMin: a.fwMin,
    fwMax: a.fwMax,
  }));
}

function visibleDocument(scope: SearchScope, productModel: string): Prisma.DocumentWhereInput {
  return {
    tenantId: scope.tenantId,
    status: 'PUBLISHED',
    audience: { in: [...scope.audiences] },
    applicability: { some: { product: { model: productModel, tenantId: scope.tenantId } } },
  };
}

type ChunkWithDoc = Prisma.DocumentChunkGetPayload<{
  include: { document: { include: ReturnType<typeof documentInclude> } };
}>;

function chunkEvidence(
  chunk: ChunkWithDoc,
  matchedBy: RawEvidence['matchedBy'],
  rawScore: number,
): RawEvidence {
  const doc = chunk.document;
  return {
    kind: 'document',
    documentId: doc.id,
    documentCode: doc.code,
    documentTitle: doc.title,
    documentType: doc.type,
    revision: doc.revision,
    language: doc.language,
    page: chunk.page,
    section: chunk.section,
    text: chunk.text,
    safetyRelevant: doc.safetyRelevant,
    matchedBy,
    chunkId: chunk.id,
    errorId: null,
    errorCode: null,
    checks: [],
    rawScore,
    rules: rulesOf(doc),
  };
}

const RELATION_LABEL = { SYMPTOM: 'SYMPTOM', CAUSE: 'CAUSE', CHECK: 'CHECK', FIX: 'FIX' } as const;

export class PrismaKnowledgeStore implements KnowledgeStore {
  constructor(private readonly db: PrismaClient) {}

  async findErrors(scope: SearchScope, productModel: string, codes: string[]) {
    if (scope.audiences.length === 0 || codes.length === 0) return [];
    const errors = await this.db.errorCode.findMany({
      where: {
        tenantId: scope.tenantId,
        code: { in: codes },
        status: 'PUBLISHED',
        product: { model: productModel, tenantId: scope.tenantId },
        // Кодът наследява видимостта на документа-източник: без публикуван източник не се цитира.
        sourceDocument: {
          tenantId: scope.tenantId,
          status: 'PUBLISHED',
          audience: { in: [...scope.audiences] },
        },
      },
      include: { relations: { orderBy: { ordinal: 'asc' } }, sourceDocument: true },
      take: 20,
    });
    const sourceIds = [
      ...new Set(errors.flatMap((e) => e.relations.map((r) => r.sourceDocumentId)).filter(Boolean)),
    ] as string[];
    const sources = new Map(
      (
        await this.db.document.findMany({
          where: { id: { in: sourceIds }, tenantId: scope.tenantId },
          select: { id: true, code: true },
        })
      ).map((d) => [d.id, d.code]),
    );

    const result: RawEvidence[] = [];
    for (const e of errors) {
      const doc = e.sourceDocument;
      if (!doc) continue;
      const checks: ErrorCheck[] = e.relations.map((r) => ({
        ordinal: r.ordinal,
        kind: r.kind,
        text: r.text,
        expected: r.expected,
        actionClass: r.actionClass as ActionClass,
        sourceDocumentCode: r.sourceDocumentId ? (sources.get(r.sourceDocumentId) ?? null) : null,
        sourcePage: r.sourcePage,
      }));
      const lines = [
        `${e.code} — ${e.title}`,
        e.description,
        `SEVERITY: ${e.severity}${e.safetyRelevant ? ' · SAFETY-RELEVANT' : ''}`,
        ...checks.map(
          (c) =>
            `${RELATION_LABEL[c.kind]} ${c.ordinal}: ${c.text}` +
            (c.expected ? ` | EXPECTED: ${c.expected}` : '') +
            (c.kind === 'CHECK' ? ` | CLASS: ${c.actionClass}` : ''),
        ),
      ];
      result.push({
        kind: 'error',
        documentId: doc.id,
        documentCode: doc.code,
        documentTitle: doc.title,
        documentType: doc.type,
        revision: doc.revision,
        language: doc.language,
        page: e.sourcePage,
        section: e.subsystem,
        text: lines.join('\n'),
        safetyRelevant: e.safetyRelevant || doc.safetyRelevant,
        matchedBy: ['exact_code'],
        chunkId: null,
        errorId: e.id,
        errorCode: e.code,
        checks,
        rawScore: 1,
        rules: [{ hwRevision: e.hwRevision, fwMin: e.fwMin, fwMax: e.fwMax }],
      });
    }
    return result;
  }

  async findChunksByIdentifiers(scope: SearchScope, productModel: string, identifiers: string[]) {
    if (scope.audiences.length === 0 || identifiers.length === 0) return [];
    const chunks = await this.db.documentChunk.findMany({
      where: {
        OR: [{ componentRefs: { hasSome: identifiers } }, { errorCodes: { hasSome: identifiers } }],
        document: visibleDocument(scope, productModel),
      },
      include: { document: { include: documentInclude(productModel, scope.tenantId) } },
      orderBy: [{ documentId: 'asc' }, { ordinal: 'asc' }],
      take: 30,
    });
    const ids = new Set(identifiers);
    return chunks.map((c) =>
      chunkEvidence(c, [c.errorCodes.some((x) => ids.has(x)) ? 'exact_code' : 'exact_ref'], 1),
    );
  }

  async searchChunks(scope: SearchScope, productModel: string, text: string, limit: number) {
    const query = toOrTsQuery(text);
    if (scope.audiences.length === 0 || query === null) return [];
    const audiences = [...scope.audiences];
    const ranked = await this.db.$queryRaw<Array<{ id: string; rank: number }>>`
      SELECT c.id, ts_rank_cd(c.tsv, q)::float8 AS rank
      FROM "DocumentChunk" c
      JOIN "Document" d ON d.id = c."documentId",
           to_tsquery('simple', ${query}) q
      WHERE c.tsv @@ q
        AND d."tenantId" = ${scope.tenantId}
        AND d.status = 'PUBLISHED'
        AND d.audience::text = ANY(${audiences})
        AND EXISTS (
          SELECT 1 FROM "DocumentApplicability" a
          JOIN "Product" p ON p.id = a."productId"
          WHERE a."documentId" = d.id AND p.model = ${productModel} AND p."tenantId" = ${scope.tenantId}
        )
      ORDER BY rank DESC
      LIMIT ${Math.min(Math.max(limit, 1), 30)}`;
    if (ranked.length === 0) return [];
    const rank = new Map(ranked.map((r) => [r.id, r.rank]));
    const chunks = await this.db.documentChunk.findMany({
      where: { id: { in: [...rank.keys()] } },
      include: { document: { include: documentInclude(productModel, scope.tenantId) } },
    });
    return chunks.map((c) => chunkEvidence(c, ['fulltext'], rank.get(c.id) ?? 0));
  }

  async getPage(scope: SearchScope, documentId: string, page: number, productModel?: string) {
    if (scope.audiences.length === 0) return [];
    const chunks = await this.db.documentChunk.findMany({
      where: {
        documentId,
        page,
        document: {
          tenantId: scope.tenantId,
          status: 'PUBLISHED',
          audience: { in: [...scope.audiences] },
        },
      },
      include: {
        document: {
          include: {
            applicability: {
              where: productModel
                ? { product: { model: productModel, tenantId: scope.tenantId } }
                : { product: { tenantId: scope.tenantId } },
            },
          },
        },
      },
      orderBy: { ordinal: 'asc' },
      take: 20,
    });
    return chunks.map((c) => chunkEvidence(c, ['exact_ref'], 1));
  }
}

/** После всеки запис на парчета: индексът за пълнотекстовото търсене. */
export async function refreshChunkIndex(db: PrismaClient, documentId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "DocumentChunk"
    SET tsv = to_tsvector('simple', coalesce(section, '') || ' ' || text)
    WHERE "documentId" = ${documentId}`;
}
