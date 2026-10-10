import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DiagnosticContextSchema, redactContext } from '../src/domain/context.js';
import type { ApplicabilityRule } from '../src/domain/versions.js';
import { EvidencePack } from '../src/ai/evidence.js';
import { applicabilityOf, optionsMatch, ruleApplies } from '../src/retrieval/applicability.js';
import { retrieve, versionOf } from '../src/retrieval/retrieve.js';
import type { EvidenceRule, KnowledgeStore, RawEvidence } from '../src/retrieval/types.js';
import { collectFor, noEvidenceAnswer } from '../src/safety/escalation.js';
import { missingRank, orderMissing, withOrderedMissing } from '../src/safety/missing-order.js';
import { GATE_VERSION } from '../src/safety/version.js';
import { boardContext, deviceOptions } from '../src/services/devices.js';
import { parseRuleOptions, rulesOf } from '../src/store/scope.js';

/**
 * FR-01 (опциите на таблото в приложимостта) и FR-07 (редът на липсващите данни) без база.
 */

const NOW = new Date('2026-10-10T12:00:00.000Z');
const ANY: ApplicabilityRule = { hwRevision: null, fwMin: null, fwMax: null };
const VF3: EvidenceRule = { ...ANY, options: { inverter: 'VF-3' } };
const X100: EvidenceRule = { ...ANY, options: { inverter: 'X100' } };
const ctx = (options: Record<string, string> = {}, over: Record<string, unknown> = {}) =>
  DiagnosticContextSchema.parse({
    productModel: 'LTX-500',
    hardwareRevision: 'B',
    firmware: '4.2',
    serial: null,
    errorCode: null,
    options,
    ...over,
  });

let seq = 0;
function row(text: string, rules: EvidenceRule[]): RawEvidence {
  seq += 1;
  return {
    kind: 'document',
    documentId: `doc-${seq}`,
    documentCode: `MAN-${seq}`,
    documentTitle: 'Manuale',
    documentType: 'MANUAL',
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
    rules,
  };
}

function store(rows: RawEvidence[]): KnowledgeStore {
  return {
    findErrors: async () => [],
    findChunksByIdentifiers: async (_s, _m, ids) =>
      rows.filter((r) => ids.some((id) => r.text.toUpperCase().includes(id))),
    searchChunks: async () => [],
    searchSemantic: async () => [],
    getPage: async () => [],
  };
}

describe('опции на таблото (FR-01)', () => {
  test('optionsMatch: празно = всички; равенство ключ/стойност без значение на регистъра', () => {
    assert.equal(optionsMatch({}, {}), true);
    assert.equal(optionsMatch(undefined, { inverter: 'VF-3' }), true);
    assert.equal(optionsMatch({ inverter: 'VF-3' }, { inverter: 'VF-3' }), true);
    assert.equal(optionsMatch({ Inverter: ' vf-3 ' }, { inverter: 'VF-3' }), true);
    assert.equal(optionsMatch({ inverter: 'VF-3' }, { inverter: 'X100' }), false);
    assert.equal(optionsMatch({ inverter: 'VF-3', stops: '8' }, { inverter: 'VF-3' }), false);
    assert.equal(optionsMatch({ inverter: 'VF-3' }, { inverter: 'VF-3', stops: '8' }), true);
  });

  test('непозната опция на случая → неприложим (fail-closed); повредено правило → никога', () => {
    assert.equal(optionsMatch({ inverter: 'VF-3' }, {}), false);
    assert.equal(optionsMatch({ inverter: 'VF-3' }, undefined), false);
    assert.equal(optionsMatch(null, { inverter: 'VF-3' }), false);
    assert.equal(parseRuleOptions({ inverter: 3 }), null);
    assert.equal(parseRuleOptions([]), null);
    assert.deepEqual(parseRuleOptions({}), {});
  });

  test('ruleApplies: HW/FW/табло И опциите', () => {
    const v = { hwRevision: 'B', firmware: '4.2', options: { inverter: 'VF-3' } };
    assert.equal(ruleApplies(VF3, v), true);
    assert.equal(ruleApplies(X100, v), false);
    assert.equal(ruleApplies({ ...VF3, fwMin: '5.0' }, v), false, 'опциите не отменят FW');
    assert.equal(ruleApplies({ ...VF3, deviceId: 'd1' }, { ...v, deviceId: 'd1' }), true);
  });

  test('applicabilityOf: поне едно правило с верните опции → приложим', () => {
    const v = { hwRevision: 'B', firmware: '4.2', options: { inverter: 'X100' } };
    assert.equal(applicabilityOf({ rules: [VF3] }, v, NOW).applicable, false);
    assert.equal(applicabilityOf({ rules: [VF3, X100] }, v, NOW).applicable, true);
    assert.equal(applicabilityOf({ rules: [ANY] }, v, NOW).applicable, true);
  });

  test('rulesOf носи опциите от базата (повреден ред → null)', () => {
    const base = { hwRevision: null, fwMin: null, fwMax: null, deviceId: null };
    const rules = rulesOf({
      applicability: [
        { ...base, id: 'a', documentId: 'd', productId: 'p', allFirmware: true, options: {} },
        {
          ...base,
          id: 'b',
          documentId: 'd',
          productId: 'p',
          allFirmware: true,
          options: { inverter: 'VF-3' },
        },
        { ...base, id: 'c', documentId: 'd', productId: 'p', allFirmware: true, options: 'x' },
      ],
    });
    assert.deepEqual(
      rules.map((r) => r.options),
      [{}, { inverter: 'VF-3' }, null],
    );
  });

  test('търсенето: документ за друг инвертор е неприложим и не става основен източник (AC-02)', async () => {
    const forVf3 = row('Parametro P12 per inverter VF-3', [VF3]);
    const forX100 = row('Parametro P12 per inverter X100', [X100]);
    const r = await retrieve(store([forX100, forVf3]), {
      scope: { tenantId: 't', audiences: ['PORTAL'] },
      context: ctx({ inverter: 'VF-3' }),
      query: 'Parametro P12',
      now: NOW,
    });
    const byText = new Map(r.items.map((i) => [i.text, i]));
    assert.equal(byText.get(forVf3.text)?.applicable, true);
    assert.equal(byText.get(forX100.text)?.applicable, false, 'несъвместимото не се крие');
    assert.equal(r.items[0]?.text, forVf3.text, 'приложимото е първо');
  });

  test('versionOf и пакетът на инструментите ползват същите опции', () => {
    const request = {
      scope: { tenantId: 't', audiences: ['PORTAL' as const] },
      context: ctx({ inverter: 'VF-3' }),
      query: '',
    };
    assert.deepEqual(versionOf(request).options, { inverter: 'VF-3' });
    const pack = new EvidencePack(
      { items: [], unknownIdentifiers: [], conflicts: [] },
      versionOf(request),
      NOW,
    );
    const added = pack.add([row('Altro inverter X100', [X100]), row('Inverter VF-3', [VF3])]);
    const applicable = new Map(added.added.map((i) => [i.text, i.applicable]));
    assert.equal(applicable.get('Inverter VF-3'), true);
    assert.equal(applicable.get('Altro inverter X100'), false);
  });

  test('контекст от табло: опциите на регистъра печелят, допълнителните остават; маскиране', () => {
    const device = {
      id: 'd1',
      tenantId: 't',
      companyId: null,
      serial: 'SN-1',
      productRevisionId: 'r',
      firmware: '4.3',
      options: { inverter: 'VF-3', stops: '8' },
      qrTokenHash: null,
      createdAt: NOW,
      revision: {
        id: 'r',
        productId: 'p',
        hwRevision: 'B',
        fwMin: '4.0',
        fwMax: null,
        product: {
          id: 'p',
          tenantId: 't',
          family: 'LTX',
          model: 'LTX-500',
          description: '',
          createdAt: NOW,
        },
      },
    };
    const merged = boardContext(ctx({ inverter: 'X100', cabin: 'glass' }), device);
    assert.deepEqual(merged.options, { inverter: 'VF-3', cabin: 'glass', stops: '8' });
    assert.equal(merged.firmware, '4.3');
    assert.equal(merged.serial, 'SN-1');
    assert.deepEqual(deviceOptions({ options: { inverter: 3 } }), {}, 'повреден запис → без опции');
    const redacted = redactContext(ctx({ note: 'mario@example.com' }));
    assert.equal(redacted.options.note, '[email]');
  });
});

describe('ред на липсващите данни (FR-07)', () => {
  test('по диагностична стойност: QR → FW → HW → код → снимка → лог → проверки → останалото', () => {
    const ordered = orderMissing([
      'Misura tensione morsetto X3',
      'collect.checksDone',
      'gate.noApplicableSource',
      'collect.eventLog',
      'ctx.photoCodeMismatch:E38',
      'collect.displayPhoto',
      'ctx.hardwareRevision',
      'ctx.firmware',
      'ctx.serial',
      'ctx.firmware',
    ]);
    assert.deepEqual(ordered, [
      'ctx.serial',
      'ctx.firmware',
      'ctx.hardwareRevision',
      'ctx.photoCodeMismatch:E38',
      'collect.displayPhoto',
      'collect.eventLog',
      'collect.checksDone',
      'Misura tensione morsetto X3',
      'gate.noApplicableSource',
    ]);
  });

  test('стабилно при равен ранг; рангове на кодовете', () => {
    assert.deepEqual(orderMissing(['b libero', 'a libero']), ['b libero', 'a libero']);
    assert.equal(missingRank('collect.serial'), 0);
    assert.equal(missingRank('ctx.unknownIdentifier:E99'), 3);
    assert.equal(missingRank('collect.errorCode'), 3);
    assert.equal(missingRank('collect.betterPhoto'), 4);
    assert.equal(missingRank('collect.logExcerpt'), 5);
    assert.equal(missingRank('kb.boardSerialRequired'), 7);
  });

  test('collectFor иска кода, когато го няма; отговорът без модел е подреден', () => {
    assert.ok(collectFor(ctx({}, { errorCode: null })).includes('collect.errorCode'));
    assert.equal(collectFor(ctx({}, { errorCode: 'E37' })).includes('collect.errorCode'), false);
    const out = noEvidenceAnswer({
      retrieval: { items: [], unknownIdentifiers: ['E99'], conflicts: [], needsBoard: true },
      context: ctx({}, { hardwareRevision: null, firmware: null }),
      question: 'E99',
      knowledgeSnapshotId: 's',
      promptVersion: 'p',
    });
    assert.deepEqual(out.missingData, [
      'ctx.serial',
      'ctx.firmware',
      'ctx.hardwareRevision',
      'ctx.unknownIdentifier:E99',
      'gate.noApplicableSource',
    ]);
    assert.equal(out.escalation.collect[0], 'collect.serial');
    assert.equal(out.promptVersion, `p+${GATE_VERSION}`);
  });

  test('withOrderedMissing подрежда и двата списъка, нищо друго не пипа', () => {
    const answer = noEvidenceAnswer({
      retrieval: { items: [], unknownIdentifiers: [], conflicts: [] },
      context: ctx(),
      question: 'x',
      knowledgeSnapshotId: 's',
      promptVersion: 'p',
    });
    const shuffled = {
      ...answer,
      missingData: ['collect.checksDone', 'ctx.serial'],
      escalation: { ...answer.escalation, collect: ['collect.eventLog', 'collect.serial'] },
    };
    const out = withOrderedMissing(shuffled);
    assert.deepEqual(out.missingData, ['ctx.serial', 'collect.checksDone']);
    assert.deepEqual(out.escalation.collect, ['collect.serial', 'collect.eventLog']);
    assert.equal(out.summary, answer.summary);
  });
});
