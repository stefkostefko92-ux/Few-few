import { canonicalIdentifier } from '../domain/normalize.js';
import type { ProductVersion } from '../domain/versions.js';
import { applicabilityFields, applicabilityOf } from '../retrieval/applicability.js';
import { applyBoardOverride } from '../retrieval/levels.js';
import { baseScore, findConflicts, keyOf, NOT_APPLICABLE_FACTOR } from '../retrieval/retrieve.js';
import type { EvidenceItem, MatchKind, RawEvidence, RetrievalResult } from '../retrieval/types.js';

/**
 * Доказателственият пакет на един отговор: E1…En от търсенето + каквото добавят инструментите
 * (E13, E14…). Референциите са последователни и стабилни — моделът цитира само тях, а Safety Gate
 * проверява цитатите срещу ФИНАЛНИЯ пакет. Съвместимостта на добавеното (HW/FW/табло и
 * валидност към момента на отговора) се смята със същото правило като в retrieve
 * (`applicabilityOf` + `versionOf` на въпроса), не от модела.
 */

/** Колко записа най-много добавя едно извикване на инструмент. */
export const MAX_ITEMS_PER_TOOL = 6;
/** Таван на целия пакет — пази контекста и цената; референциите остават под E999 (схемата). */
export const MAX_PACK_TOTAL = 40;
export interface AddResult {
  /** Нови записи с нови референции. */
  added: EvidenceItem[];
  /** Вече бяха в пакета — моделът получава старата референция, не дубликат. */
  existing: EvidenceItem[];
  /** Колко са отрязани от тавана. */
  truncated: number;
}

export class EvidencePack {
  private readonly items: EvidenceItem[];
  private readonly byKey = new Map<string, EvidenceItem>();
  private readonly unknown: Set<string>;
  private readonly initialCount: number;
  private readonly needsBoard: boolean;

  constructor(
    initial: RetrievalResult,
    private readonly version: ProductVersion,
    private readonly now: Date = new Date(),
  ) {
    this.items = [...initial.items];
    for (const item of this.items) this.byKey.set(keyOf(item), item);
    this.unknown = new Set(initial.unknownIdentifiers);
    this.initialCount = initial.items.length;
    this.needsBoard = initial.needsBoard === true;
  }

  get all(): readonly EvidenceItem[] {
    return this.items;
  }

  get addedCount(): number {
    return this.items.length - this.initialCount;
  }

  /** Документ, който вече е в пакета — само до него стига get_document_page (least privilege). */
  hasDocument(documentId: string): boolean {
    return this.items.some((i) => i.documentId === documentId);
  }

  add(raws: RawEvidence[]): AddResult {
    const maxRaw = Math.max(
      0,
      ...raws.map((r) => r.rawScore).filter((s) => Number.isFinite(s) && s > 0),
    );
    const scored = raws
      .map((raw) => {
        const a = applicabilityOf(raw, this.version, this.now);
        const share = maxRaw > 0 ? raw.rawScore / maxRaw : 0;
        const score = baseScore(raw.matchedBy, share) * (a.applicable ? 1 : NOT_APPLICABLE_FACTOR);
        return { raw, a, score };
      })
      .sort((a, b) => b.score - a.score);

    const result: AddResult = { added: [], existing: [], truncated: 0 };
    const seen = new Set<string>();
    for (const { raw, a, score } of scored) {
      const key = keyOf(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = this.byKey.get(key);
      if (prev) {
        result.existing.push(prev);
        continue;
      }
      if (result.added.length >= MAX_ITEMS_PER_TOOL || this.items.length >= MAX_PACK_TOTAL) {
        result.truncated += 1;
        continue;
      }
      const {
        rawScore: _rawScore,
        rules: _rules,
        effectiveFrom: _from,
        effectiveTo: _to,
        ...rest
      } = raw;
      const item: EvidenceItem = {
        ...rest,
        matchedBy: [...rest.matchedBy],
        ref: `E${this.items.length + 1}`,
        ...applicabilityFields(a),
        score: Math.round(score * 1000) / 1000,
      };
      this.items.push(item);
      this.byKey.set(key, item);
      result.added.push(item);
      if (item.errorCode) this.unknown.delete(canonicalIdentifier(item.errorCode));
    }
    return result;
  }

  /**
   * Финалният пакет — конфликтите се преизчисляват детерминистично върху всичко добавено.
   * `cited` — референциите, които моделът е цитирал: документ с две ревизии, цитиран от модела,
   * е конфликт, колкото и слабо да е намерен.
   */
  result(cited: ReadonlySet<string> = new Set()): RetrievalResult {
    // Собствената схема на таблото, добавена от инструмент, заменя общата и в крайния пакет.
    const items = applyBoardOverride([...this.items]);
    return {
      items,
      unknownIdentifiers: [...this.unknown],
      conflicts: findConflicts(items, cited),
      ...(this.needsBoard ? { needsBoard: true } : {}),
    };
  }
}
