import { Prisma } from '@prisma/client';
import type { ApplicabilityRule } from '../domain/versions.js';
import type { RawEvidence, SearchScope } from '../retrieval/types.js';

/**
 * Филтрите на знанието в ЕДНО място (Prisma + суров SQL): клиент, PUBLISHED, аудитория и
 * приложимост към модела — общите правила (`deviceId IS NULL`) и САМО правилата за провереното
 * табло на случая. Документ, вързан за друго табло, не стига до пакета (нито до модела) изобщо.
 * Валидността (effectiveFrom/To) не е филтър: документът извън срока се връща като неприложим,
 * за да личи в отговора защо не е източник.
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

export function rulesOf(doc: Pick<DocumentWithRules, 'applicability'>): ApplicabilityRule[] {
  return doc.applicability.map((a) => ({
    hwRevision: a.hwRevision,
    fwMin: a.fwMin,
    fwMax: a.fwMax,
    deviceId: a.deviceId,
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
