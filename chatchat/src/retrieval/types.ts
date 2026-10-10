import type { DiagnosticContext } from '../domain/context.js';
import type { ActionClass } from '../domain/response.js';
import type { ApplicabilityRule, ProductVersion, Validity } from '../domain/versions.js';

/**
 * Договорът на търсенето (§8). Хранилището (Prisma или в паметта за тестовете) прилага ВИНАГИ
 * три филтъра, които моделът не може да разшири: клиент (tenant), аудитория по ролята и статус
 * PUBLISHED (§7.3 „правило за публикуване“). Съвместимостта с версията се изчислява тук и се
 * връща като флаг — несъвместимото не се крие, а се наказва и не става основен източник (AC-02).
 */

export type Audience = 'PORTAL' | 'INTERNAL' | 'ENGINEERING';

/** Опциите на конфигурацията на таблото (FR-01): { inverter: "VF-3", stops: "8" }. */
export type BoardOptions = Readonly<Record<string, string>>;

/**
 * Правило за приложимост на запис от пакета: HW/FW/табло (`domain/versions.ts`) + по избор
 * ограничение по опции (FR-01). `options` липсва/празно → всички конфигурации; null → неразчетено
 * ограничение (повреден ред) — fail-closed, никога не съвпада (`retrieval/applicability.ts`).
 */
export type EvidenceRule = ApplicabilityRule & { options?: BoardOptions | null };

/** Версията на случая за приложимостта: HW/FW/табло + опциите от контекста (FR-01). */
export type CaseVersion = ProductVersion & { options?: BoardOptions };

export interface SearchScope {
  tenantId: string;
  /** Аудиториите, които ролята вижда (от rbac.ts). */
  audiences: readonly Audience[];
  /**
   * Провереното табло на случая (Case.deviceId, чийто сериен номер съвпада с контекста). Само с
   * него документите, вързани за конкретно табло, влизат в търсенето — и то само неговите (SQL).
   * Идва от сървъра, никога от модела; липсва/null → само общите документи за модела.
   */
  deviceId?: string | null;
}

/**
 * Как е намерен записът. `semantic` (pgvector, §8.1 „semantic search“) е само подкрепа: никога не
 * е „точно“ съвпадение и само по себе си не дава ниво „strong“ (виж evidenceLevel).
 */
export type MatchKind = 'exact_code' | 'exact_ref' | 'fulltext' | 'semantic';

/** Точните съвпадения — привилегированият път (§8.2), не се режат от лимита. */
export function isExactMatch(kind: MatchKind): boolean {
  return kind === 'exact_code' || kind === 'exact_ref';
}

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
  /**
   * 0..1 — ЛЕКСИКАЛНАТА релевантност (точно/пълнотекстово) след приложимостта. Семантичното
   * съвпадение не я вдига — то е в `similarity` и влиза в подредбата през RRF.
   */
  score: number;
  /** Косинусово сходство 0..1 със семантичното търсене (само ако matchedBy съдържа semantic). */
  similarity?: number;
  chunkId: string | null;
  errorId: string | null;
  errorCode: string | null;
  /** Само за kind = error: структурираните проверки от базата с кодове. */
  checks: ErrorCheck[];
  /** Документът е вързан за таблото на случая (уникалната му схема) — подрежда се пред общите. */
  boardSpecific?: boolean;
  /** Извън срока на валидност (§7.2) → неприложим; липсва, когато документът е в сила. */
  validity?: Exclude<Validity, 'effective'>;
  /** Обща ревизия, заменена за таблото на случая от собствената му (`applyBoardOverride`). */
  replacedByBoard?: boolean;
}

export interface RetrievalRequest {
  scope: SearchScope;
  context: DiagnosticContext;
  query: string;
  /** Колко парчета пълнотекстово най-много (exact съвпаденията не се режат). */
  limit?: number;
  /** Моментът на отговора — спрямо него се смята валидността (по подразбиране сега). */
  now?: Date;
}

export interface RetrievalResult {
  items: EvidenceItem[];
  /** Идентификатори от въпроса, за които НЯМА запис за този продукт — изрично се казва (§16.3). */
  unknownIdentifiers: string[];
  /** Документи с еднакъв код и различни ревизии в пакета, или противоречащи записи. */
  conflicts: Array<{ description: string; refs: string[] }>;
  /**
   * Случаят няма проверено табло, а по въпроса има документи САМО за конкретни табла (уникални
   * схеми) — отговорът иска сериен номер/QR (`ctx.serial`). Съдържанието им не е в пакета.
   */
  needsBoard?: boolean;
}

/**
 * Суров ред от хранилището, преди съвместимостта, класирането и номерирането. `rules` са
 * правилата за приложимост към модела от контекста (поне едно — иначе редът не се връща).
 */
export type RawEvidence = Omit<
  EvidenceItem,
  'ref' | 'score' | 'applicable' | 'validity' | 'boardSpecific' | 'replacedByBoard'
> & {
  rawScore: number;
  rules: EvidenceRule[];
  /** Валидността на документа (на кода — на документа-източник); липсва = без ограничение. */
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
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
   * Семантично търсене (pgvector, косинус) в парчетата на документите за модела — със същите
   * филтри в SQL (tenant, PUBLISHED, аудитория, модел). Fail-open: без embeddings или при грешка
   * на доставчика връща [] и търсенето остава точно + пълнотекстово. rawScore = 0, сходството е
   * в `similarity`.
   */
  searchSemantic(
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
  /**
   * Съвпадат ли идентификаторите/думите на въпроса с публикувани документи САМО за конкретни табла
   * на модела — само сигнал (съвпаднали идентификатори + най-високият пълнотекстов ранг), без
   * съдържание.
   * Вика се, когато случаят няма проверено табло. Хранилище без него (в паметта) → няма такива.
   */
  boardSpecificMatches?(
    scope: SearchScope,
    productModel: string,
    identifiers: string[],
    text: string,
  ): Promise<{ identifiers: string[]; rank: number }>;
}
