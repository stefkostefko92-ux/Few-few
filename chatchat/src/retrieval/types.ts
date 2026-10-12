import type { DiagnosticContext } from '../domain/context.js';
import type { ActionClass } from '../domain/response.js';
import type { ApplicabilityRule } from '../domain/versions.js';

/**
 * Договорът на търсенето (§8). Хранилището (Prisma или в паметта за тестовете) прилага ВИНАГИ
 * три филтъра, които моделът не може да разшири: клиент (tenant), аудитория по ролята и статус
 * PUBLISHED (§7.3 „правило за публикуване“). Съвместимостта с версията се изчислява тук и се
 * връща като флаг — несъвместимото не се крие, а се наказва и не става основен източник (AC-02).
 */

export type Audience = 'PORTAL' | 'INTERNAL' | 'ENGINEERING';

export interface SearchScope {
  tenantId: string;
  /** Аудиториите, които ролята вижда (от rbac.ts). */
  audiences: readonly Audience[];
}

export type MatchKind = 'exact_code' | 'exact_ref' | 'fulltext';

export interface ErrorCheck {
  ordinal: number;
  kind: 'SYMPTOM' | 'CAUSE' | 'CHECK' | 'FIX';
  text: string;
  expected: string | null;
  actionClass: ActionClass;
  sourceDocumentCode: string | null;
  sourcePage: number | null;
}

export interface EvidenceItem {
  /** Референцията в пакета към модела: E1, E2… (стабилна в рамките на един отговор). */
  ref: string;
  kind: 'document' | 'error';
  documentId: string;
  documentCode: string;
  documentTitle: string;
  documentType: string;
  revision: string;
  language: string;
  page: number | null;
  section: string | null;
  /** Текстът, който моделът вижда — и срещу който се проверяват дословните цитати. */
  text: string;
  safetyRelevant: boolean;
  applicable: boolean;
  matchedBy: MatchKind[];
  /** 0..1 — нормализирана релевантност след подреждането. */
  score: number;
  chunkId: string | null;
  errorId: string | null;
  errorCode: string | null;
  /** Само за kind = error: структурираните проверки от базата с кодове. */
  checks: ErrorCheck[];
}

export interface RetrievalRequest {
  scope: SearchScope;
  context: DiagnosticContext;
  query: string;
  /** Колко парчета пълнотекстово най-много (exact съвпаденията не се режат). */
  limit?: number;
}

export interface RetrievalResult {
  items: EvidenceItem[];
  /** Идентификатори от въпроса, за които НЯМА запис за този продукт — изрично се казва (§16.3). */
  unknownIdentifiers: string[];
  /** Документи с еднакъв код и различни ревизии в пакета, или противоречащи записи. */
  conflicts: Array<{ description: string; refs: string[] }>;
}

/**
 * Суров ред от хранилището, преди съвместимостта, класирането и номерирането. `rules` са
 * правилата за приложимост към модела от контекста (поне едно — иначе редът не се връща).
 */
export type RawEvidence = Omit<EvidenceItem, 'ref' | 'score' | 'applicable'> & {
  rawScore: number;
  rules: ApplicabilityRule[];
};

export interface KnowledgeStore {
  /** Точно търсене на кодове за грешка за модела (всички версии — съвместимостта се смята после). */
  findErrors(scope: SearchScope, productModel: string, codes: string[]): Promise<RawEvidence[]>;
  /** Точно търсене по componentRefs / errorCodes в парчетата. */
  findChunksByIdentifiers(
    scope: SearchScope,
    productModel: string,
    identifiers: string[],
  ): Promise<RawEvidence[]>;
  /** Пълнотекстово търсене (Postgres tsvector) в документите за модела. */
  searchChunks(
    scope: SearchScope,
    productModel: string,
    text: string,
    limit: number,
  ): Promise<RawEvidence[]>;
  /**
   * Една страница от документ — само ако документът е видим в обхвата. С `productModel`
   * правилата за приложимост са само за този модел (празни → несъвместим); AI инструментът
   * get_document_page ВИНАГИ го подава.
   */
  getPage(
    scope: SearchScope,
    documentId: string,
    page: number,
    productModel?: string,
  ): Promise<RawEvidence[]>;
}
