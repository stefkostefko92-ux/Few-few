import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { BoardOptions, EvidenceRule, RawEvidence, SearchScope } from '../retrieval/types.js';

/**
 * Филтрите на знанието в ЕДНО място (Prisma + суров SQL): клиент, PUBLISHED, аудитория и
 * приложимост към модела — общите правила (`deviceId IS NULL`) и САМО правилата за провереното
 * табло на случая. Документ, вързан за друго табло, не стига до пакета (нито до модела) изобщо.
 * Валидността (effectiveFrom/To) не е филтър: документът извън срока се връща като неприложим,
 * за да личи в отговора защо не е източник. Ограничението по опции (FR-01) също не е филтър за AI:
 * правилата носят `options` (`rulesOf`) и несъвпадението прави записа неприложим
 * (`retrieval/applicability.ts`) — несъвместимото не се крие (AC-02). Самостоятелното търсене на
 * документи (FR-03, `searchableDocumentSql`) филтрира по всичко това в SQL.
 */

/** Правилата на документа, които важат за модела в обхвата (без чуждите табла). */
export function ruleWhere(
  scope: Pick<SearchScope, 'tenantId' | 'deviceId'>,
  productModel: string,
): Prisma.DocumentApplicabilityWhereInput {
  return {
    product: { model: productModel, tenantId: scope.tenantId },
    OR: [{ deviceId: null }, ...(scope.deviceId ? [{ deviceId: scope.deviceId }] : [])],
  };
}

export const documentInclude = (
  productModel: string,
  scope: Pick<SearchScope, 'tenantId' | 'deviceId'>,
) =>
  ({
    applicability: { where: ruleWhere(scope, productModel) },
  }) satisfies Prisma.DocumentInclude;

type DocumentWithRules = Prisma.DocumentGetPayload<{
  include: ReturnType<typeof documentInclude>;
}>;

/** Опциите на правило/табло (FR-01): обект ключ → стойност с таваните на контекста (§10.1). */
export const BoardOptionsSchema = z
  .record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(80))
  .refine((o) => Object.keys(o).length <= 20, 'най-много 20 опции');

/**
 * Ограничението по опции от базата (jsonb). {} → всички конфигурации; повреден ред (не обект,
 * нестрингова стойност) → null — правилото никога не съвпада (fail-closed, `optionsMatch`).
 */
export function parseRuleOptions(json: Prisma.JsonValue): BoardOptions | null {
  const parsed = BoardOptionsSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function rulesOf(doc: Pick<DocumentWithRules, 'applicability'>): EvidenceRule[] {
  return doc.applicability.map((a) => ({
    hwRevision: a.hwRevision,
    fwMin: a.fwMin,
    fwMax: a.fwMax,
    deviceId: a.deviceId,
    options: parseRuleOptions(a.options),
  }));
}

export function visibleDocument(
  scope: SearchScope,
  productModel: string,
): Prisma.DocumentWhereInput {
  return {
    tenantId: scope.tenantId,
    status: 'PUBLISHED',
    audience: { in: [...scope.audiences] },
    applicability: { some: ruleWhere(scope, productModel) },
  };
}

/**
 * Същото условие за суровия SQL (пълнотекстово и семантично): `d` е псевдонимът на "Document".
 * Без табло `a."deviceId" = NULL` никога не е истина → само общите правила.
 */
export function applicableSql(scope: SearchScope, productModel: string): Prisma.Sql {
  return Prisma.sql`EXISTS (
          SELECT 1 FROM "DocumentApplicability" a
          JOIN "Product" p ON p.id = a."productId"
          WHERE a."documentId" = d.id AND p.model = ${productModel} AND p."tenantId" = ${scope.tenantId}
            AND (a."deviceId" IS NULL OR a."deviceId" = ${scope.deviceId ?? null})
        )`;
}

/** Филтрите на самостоятелното търсене на документи (FR-03) — същите като на AI + валидност. */
export interface DocumentSearchFilter {
  /** Клиент, аудиториите на ролята и провереното табло (видимостта му е проверена от рутера). */
  scope: SearchScope;
  /** Само документи с правило за този модел; липсва → за всеки модел на клиента. */
  productModel?: string | null;
  type?: string | null;
  language?: string | null;
  /** Моментът на търсенето — извън [effectiveFrom, effectiveTo] документът не се връща. */
  now: Date;
}

/**
 * Условието за `d` ("Document") при търсенето на техника извън чата (FR-03): клиент, PUBLISHED,
 * аудиторията на ролята, валидност към момента, тип/език по избор и поне едно правило за модела
 * (ако е даден) — общо (`deviceId IS NULL`) или САМО за провереното табло. Документ само за чуждо
 * табло не се намира (като при AI). Опциите на таблото (FR-01) не са в SQL — съвпадението им е
 * едно правило за всички (`retrieval/applicability.ts`), прилага го `services/doc-search.ts`
 * върху правилата от `searchRulesWhere`.
 */
export function searchableDocumentSql(f: DocumentSearchFilter): Prisma.Sql {
  const { scope } = f;
  const audiences = [...scope.audiences];
  return Prisma.sql`d."tenantId" = ${scope.tenantId}
        AND d.status = 'PUBLISHED'
        AND d.audience::text = ANY(${audiences})
        AND d."effectiveFrom" <= ${f.now}
        AND (d."effectiveTo" IS NULL OR d."effectiveTo" >= ${f.now})
        AND (${f.type ?? null}::text IS NULL OR d.type::text = ${f.type ?? null})
        AND (${f.language ?? null}::text IS NULL OR d.language = ${f.language ?? null})
        AND EXISTS (
          SELECT 1 FROM "DocumentApplicability" a
          JOIN "Product" p ON p.id = a."productId"
          WHERE a."documentId" = d.id AND p."tenantId" = ${scope.tenantId}
            AND (${f.productModel ?? null}::text IS NULL OR p.model = ${f.productModel ?? null})
            AND (a."deviceId" IS NULL OR a."deviceId" = ${scope.deviceId ?? null})
        )`;
}

/** Правилата на намерените документи, които важат в обхвата на търсенето (без чуждите табла). */
export function searchRulesWhere(
  f: Pick<DocumentSearchFilter, 'scope' | 'productModel'>,
): Prisma.DocumentApplicabilityWhereInput {
  return {
    product: {
      tenantId: f.scope.tenantId,
      ...(f.productModel ? { model: f.productModel } : {}),
    },
    OR: [{ deviceId: null }, ...(f.scope.deviceId ? [{ deviceId: f.scope.deviceId }] : [])],
  };
}

export type ChunkWithDoc = Prisma.DocumentChunkGetPayload<{
  include: { document: { include: ReturnType<typeof documentInclude> } };
}>;

export function chunkEvidence(
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
    effectiveFrom: doc.effectiveFrom,
    effectiveTo: doc.effectiveTo,
  };
}
