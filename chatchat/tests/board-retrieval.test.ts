import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DiagnosticContextSchema } from '../src/domain/context.js';
import { isApplicable, validityAt, type ApplicabilityRule } from '../src/domain/versions.js';
import { EvidencePack } from '../src/ai/evidence.js';
import { applicabilityOf } from '../src/retrieval/applicability.js';
import { applyBoardOverride, findConflicts } from '../src/retrieval/levels.js';
import { retrieve, versionOf } from '../src/retrieval/retrieve.js';
import type {
  EvidenceItem,
  KnowledgeStore,
  RawEvidence,
  SearchScope,
} from '../src/retrieval/types.js';
import { noEvidenceAnswer } from '../src/safety/escalation.js';
import { BOARD_SERIAL_REQUIRED, knowledgeNotices } from '../src/safety/knowledge.js';

/**
 * Уникалните схеми по табло и валидността на документите (решение на собственика, §7.2, §8.2)
 * без база: правилото с табло важи само за случай с ТОВА табло; собствената ревизия на таблото
 * замества общата (без фалшив конфликт); без табло → `ctx.serial`; изтекъл документ е неприложим
 * и личи в отговора.
 */

const NOW = new Date('2026-10-10T12:00:00.000Z');
const MODEL = 'LTX-500';
const ANY: ApplicabilityRule = { hwRevision: null, fwMin: null, fwMax: null };
const onBoard = (deviceId: string): ApplicabilityRule => ({ ...ANY, deviceId });
const ctx = (serial: string | null = null) =>
  DiagnosticContextSchema.parse({
    productModel: MODEL,
    hardwareRevision: 'B',
    firmware: '4.2',
    serial,
    errorCode: null,
  });

let seq = 0;
function chunk(text: string, over: Partial<RawEvidence> = {}): RawEvidence {
  seq += 1;
  return {
    kind: 'document',
    documentId: `doc-${seq}`,
    documentCode: `SCH-${seq}`,
    documentTitle: 'Schema',
    documentType: 'SCHEMATIC',
    revision: 'A',
    language: 'it',
    page: 1,
    section: null,
    text,
    safetyRelevant: false,
    matchedBy: ['exact_ref'],
    chunkId: `c-${seq}`,
    errorId: null,
    errorCode: null,
    checks: [],
    rawScore: 1,
    rules: [ANY],
    ...over,
  };
}

/** Хранилище в паметта със СЪЩОТО правило като SQL: общите + само правилата за таблото на случая. */
class BoardStore implements KnowledgeStore {
  constructor(
    private readonly rows: RawEvidence[],
    private readonly board: { identifiers: string[]; rank: number } | null = null,
  ) {}
  private visible(scope: SearchScope): RawEvidence[] {
    return this.rows
      .map((r) => ({
        ...r,
        rules: r.rules.filter((x) => !x.deviceId || x.deviceId === scope.deviceId),
      }))
      .filter((r) => r.rules.length > 0);
  }
  async findErrors() {
    return [];
  }
  async findChunksByIdentifiers(scope: SearchScope, _m: string, ids: string[]) {
    return this.visible(scope).filter((r) => ids.some((id) => r.text.toUpperCase().includes(id)));
  }
  async searchChunks() {
    return [];
  }
  async searchSemantic() {
    return [];
  }
  async getPage() {
    return [];
  }
  async boardSpecificMatches() {
    return this.board ?? { identifiers: [], rank: 0 };
  }
}

const scope = (deviceId: string | null = null): SearchScope => ({
  tenantId: 't1',
  audiences: ['PORTAL'],
  deviceId,
});
const ask = (store: KnowledgeStore, deviceId: string | null, query = 'Relè K9') =>
  retrieve(store, {
    scope: scope(deviceId),
    context: ctx(deviceId ? 'SN' : null),
    query,
    now: NOW,
  });

describe('правило за табло и валидност (domain)', () => {
  test('правило с табло: само за случай с това табло; без табло в случая — не', () => {
    const v = { hwRevision: 'B', firmware: '4.2' };
    assert.equal(isApplicable(onBoard('d1'), { ...v, deviceId: 'd1' }), true);
    assert.equal(isApplicable(onBoard('d1'), { ...v, deviceId: 'd2' }), false);
    assert.equal(isApplicable(onBoard('d1'), { ...v, deviceId: null }), false);
    assert.equal(isApplicable(onBoard('d1'), v), false);
    assert.equal(isApplicable(ANY, { ...v, deviceId: 'd1' }), true, 'общото важи и с табло');
  });

  test('валидност: [от, до] включително; без граници — винаги', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-06-30T23:59:59Z');
    assert.equal(
      validityAt({ effectiveFrom: from, effectiveTo: to }, new Date('2025-12-31')),
      'notYetEffective',
    );
    assert.equal(validityAt({ effectiveFrom: from, effectiveTo: to }, from), 'effective');
    assert.equal(validityAt({ effectiveFrom: from, effectiveTo: to }, to), 'effective');
    assert.equal(
      validityAt({ effectiveFrom: from, effectiveTo: to }, new Date('2026-07-01')),
      'expired',
    );
    assert.equal(validityAt({}, NOW), 'effective');
  });

  test('applicabilityOf: изтекъл → неприложим; табло → boardSpecific', () => {
    const version = { hwRevision: 'B', firmware: '4.2', deviceId: 'd1' };
    const expired = applicabilityOf(
      { rules: [ANY], effectiveFrom: new Date('2025-01-01'), effectiveTo: new Date('2025-06-30') },
      version,
      NOW,
    );
    assert.deepEqual(expired, { applicable: false, validity: 'expired', boardSpecific: false });
    const own = applicabilityOf({ rules: [onBoard('d1')] }, version, NOW);
    assert.deepEqual(own, { applicable: true, validity: 'effective', boardSpecific: true });
    assert.equal(versionOf({ scope: scope('d9'), context: ctx(), query: '' }).deviceId, 'd9');
  });
});

describe('търсене: уникалните схеми на таблото', () => {
  const own = chunk('Schema del quadro A: relè K9 sul morsetto X21.', {
    documentCode: 'SCH-K9',
    revision: 'A1',
    rules: [onBoard('dA')],
  });
  const other = chunk('Schema del quadro B: relè K9 sul morsetto X22.', {
    documentCode: 'SCH-K9',
    revision: 'B1',
    rules: [onBoard('dB')],
  });
  const general = chunk('Schema generale: relè K9 sul morsetto X20.', {
    documentCode: 'SCH-K9',
    revision: 'G',
  });

  test('табло A вижда своята схема (първа), не тази на B; общата със същия код е заменена', async () => {
    const res = await ask(new BoardStore([general, other, own]), 'dA');
    assert.equal(res.items[0]?.revision, 'A1');
    assert.equal(res.items[0]?.boardSpecific, true);
    assert.equal(res.items[0]?.applicable, true);
    assert.equal(
      res.items.some((i) => i.revision === 'B1'),
      false,
      'схемата на B не стига до A',
    );
    const replaced = res.items.find((i) => i.revision === 'G');
    assert.equal(replaced?.applicable, false);
    assert.equal(replaced?.replacedByBoard, true);
    assert.deepEqual(res.conflicts, [], 'без фалшив конфликт между табло и общата ревизия');
    assert.equal(res.needsBoard, undefined);
  });

  test('без табло: само общото; сигнал за сериен номер, идентификаторът не е „непознат“', async () => {
    const res = await ask(new BoardStore([other, own], { identifiers: ['K9'], rank: 0 }), null);
    assert.deepEqual(res.items, []);
    assert.equal(res.needsBoard, true);
    assert.deepEqual(res.unknownIdentifiers, []);
    const answer = noEvidenceAnswer({
      retrieval: res,
      context: ctx(),
      question: 'Relè K9',
      knowledgeSnapshotId: 'ks',
      promptVersion: 'p',
    });
    assert.ok(answer.missingData.includes('ctx.serial'));
    assert.ok(answer.gate.decisions.includes(BOARD_SERIAL_REQUIRED));
    assert.ok(answer.escalation.collect.includes('collect.serial'));
  });

  test('с табло сигналът не се търси; слаб пълнотекстов ранг спрямо общите не е сигнал', async () => {
    assert.equal(
      (await ask(new BoardStore([own], { identifiers: ['K9'], rank: 1 }), 'dA')).needsBoard,
      undefined,
    );
    const weak = await retrieve(new BoardStore([general], { identifiers: [], rank: 0 }), {
      scope: scope(null),
      context: ctx(),
      query: 'Relè K9',
      now: NOW,
    });
    assert.equal(weak.needsBoard, undefined);
  });

  test('две собствени ревизии на таблото → конфликт; различни табла никога не се сравняват', () => {
    const item = (over: Partial<EvidenceItem>): EvidenceItem => ({
      ...chunk('testo'),
      ref: `E${(seq += 1)}`,
      applicable: true,
      score: 1,
      ...over,
    });
    const a1 = item({ documentCode: 'SCH', revision: '1', boardSpecific: true });
    const a2 = item({ documentCode: 'SCH', revision: '2', boardSpecific: true });
    const g = item({ documentCode: 'SCH', revision: 'G' });
    assert.deepEqual(
      findConflicts([a1, a2]).map((c) => c.description),
      ['revision:SCH'],
    );
    const overridden = applyBoardOverride([a1, g]);
    assert.equal(overridden[1]?.applicable, false);
    assert.deepEqual(findConflicts(overridden), []);
  });

  test('схема на таблото, добавена от инструмент, също заменя общата в крайния пакет', () => {
    const base = { items: [], unknownIdentifiers: [], conflicts: [] };
    const pack = new EvidencePack(base, { hwRevision: 'B', firmware: '4.2', deviceId: 'dA' }, NOW);
    pack.add([general]);
    pack.add([own]);
    const result = pack.result();
    assert.equal(result.items.find((i) => i.revision === 'G')?.applicable, false);
    assert.equal(result.items.find((i) => i.revision === 'A1')?.boardSpecific, true);
  });
});

describe('валидност на документа в отговора (§7.2)', () => {
  test('изтекъл документ: неприложим, „none“ и личи в отговора; шумът не се показва', async () => {
    const expired = chunk('Per il codice E55 sostituire il fusibile F3.', {
      documentCode: 'BULL-FUSE',
      revision: '1',
      effectiveFrom: new Date('2025-01-01'),
      effectiveTo: new Date('2025-06-30'),
    });
    const res = await retrieve(new BoardStore([expired]), {
      scope: scope(null),
      context: ctx(),
      query: 'E55',
      now: NOW,
    });
    assert.equal(res.items[0]?.applicable, false);
    assert.equal(res.items[0]?.validity, 'expired');
    const notes = knowledgeNotices(res);
    assert.deepEqual(notes.decisions, ['kb.sourceExpired:BULL-FUSE@1']);
    const answer = noEvidenceAnswer({
      retrieval: res,
      context: ctx(),
      question: 'E55',
      knowledgeSnapshotId: 'ks',
      promptVersion: 'p',
    });
    assert.equal(answer.status, 'undetermined');
    assert.ok(answer.gate.decisions.includes('kb.sourceExpired:BULL-FUSE@1'));
    const noise = {
      ...res,
      items: res.items.map((i) => ({ ...i, matchedBy: ['fulltext' as const], score: 0.01 })),
    };
    assert.deepEqual(knowledgeNotices(noise).decisions, []);
    assert.deepEqual(knowledgeNotices(noise, new Set([noise.items[0]?.ref ?? ''])).decisions, [
      'kb.sourceExpired:BULL-FUSE@1',
    ]);
  });

  test('още невалиден документ: същото с „notYetEffective“', async () => {
    const future = chunk('Per il codice E56 aggiornare la configurazione.', {
      documentCode: 'BULL-FUT',
      revision: '1',
      effectiveFrom: new Date('2099-01-01'),
    });
    const res = await retrieve(new BoardStore([future]), {
      scope: scope(null),
      context: ctx(),
      query: 'E56',
      now: NOW,
    });
    assert.equal(res.items[0]?.validity, 'notYetEffective');
    assert.deepEqual(knowledgeNotices(res).decisions, ['kb.sourceNotYetEffective:BULL-FUT@1']);
  });
});
