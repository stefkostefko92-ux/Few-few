import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import {
  answerOf,
  ask,
  docBody,
  MODEL,
  newCase,
  publishDoc,
  seedWorld,
  type World,
} from './world.js';

/**
 * Уникалните схеми по табло (решение на собственика) и валидността (§7.2) през истинския поток:
 * качване → публикуване → случай → AI пакет → отговор. Схемата за табло A стига САМО до случай
 * на табло A; без табло отговорът иска сериен номер; документ извън срока не е източник.
 */

let h: Harness;
let w: World;

before(async () => {
  h = await startApp();
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  h.model.reset();
  w = await seedWorld(h);
});

const SCHEME_A =
  'Schema del quadro SN-ALFA-1: il relè K9 comanda la ventola tramite il morsetto X21.';
const board = (serial: string) => [
  { productModel: MODEL, allFirmware: true, deviceSerial: serial },
];
const publishScheme = () =>
  publishDoc(w.ownerA1, {
    code: 'SCH-K9',
    revision: 'A1',
    type: 'SCHEMATIC',
    applicability: board('SN-ALFA-1'),
    pages: [{ page: 3, text: SCHEME_A }],
  });
const lastPack = () => h.model.packs.at(-1) ?? [];

describe('качване: таблото е от клиента и от модела на правилото', () => {
  test('непознат, чужд, друг модел или друга HW → 422 device_not_found със серийните номера', async () => {
    const post = (rule: object) =>
      w.ownerA1.post('/api/v1/admin/documents', {
        ...docBody({ code: 'SCH-X', pages: [{ page: 1, text: 'x' }] }),
        applicability: [{ productModel: MODEL, allFirmware: true, ...rule }],
      });
    for (const rule of [
      { deviceSerial: 'NEMA' },
      { deviceSerial: 'SN-B-1' },
      { deviceSerial: 'SN-ZZ-1' },
      { deviceSerial: 'SN-ALFA-2', hwRevision: 'B' },
    ]) {
      const r = await post(rule);
      assert.deepEqual(
        [r.status, r.body.code, r.body.serials],
        [422, 'device_not_found', [rule.deviceSerial]],
      );
    }
    assert.equal(await db.document.count({ where: { code: 'SCH-X' } }), 0);
    const ok = await post({ deviceSerial: 'SN-ALFA-2', hwRevision: 'c' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
  });
});

describe('схема за табло A', () => {
  test('табло A я вижда (първа, boardSpecific) и я цитира; табло B (същият модел) — не', async () => {
    const id = await publishScheme();
    const caseA = await newCase(w.portalAlfa, {
      deviceSerial: 'SN-ALFA-1',
      context: { errorCode: null },
    });
    const a = answerOf(await ask(w.portalAlfa, caseA, 'A cosa serve il relè K9?'));
    assert.equal(lastPack()[0]?.documentId, id);
    assert.match(h.model.texts.at(-1) ?? '', /"boardSpecific":true/);
    assert.ok(a.evidence.some((e: { documentId: string }) => e.documentId === id));

    const caseB = await newCase(w.portalAlfa, {
      deviceSerial: 'SN-ALFA-2',
      context: { errorCode: null },
    });
    const b = answerOf(await ask(w.portalAlfa, caseB, 'A cosa serve il relè K9?'));
    assert.equal(JSON.stringify(b).includes('SCH-K9'), false);
    assert.equal(h.model.texts.slice(1).join('').includes('X21'), false, 'не стига и до модела');
    assert.equal(b.missingData.includes('ctx.serial'), false, 'таблото е известно');
  });

  test('без табло в случая: не е приложима, отговорът иска сериен номер/QR', async () => {
    await publishScheme();
    const caseId = await newCase(w.internal, { context: { errorCode: null } });
    const answer = answerOf(await ask(w.internal, caseId, 'A cosa serve il relè K9?'));
    assert.equal(JSON.stringify(answer).includes('SCH-K9'), false);
    assert.ok(answer.missingData.includes('ctx.serial'));
    assert.ok(answer.gate.decisions.includes('kb.boardSerialRequired'));
    assert.equal(answer.missingData.includes('ctx.unknownIdentifier:K9'), false, 'K9 съществува');
    assert.ok(answer.escalation.collect.includes('collect.serial'));
  });

  test('сменен сериен номер в контекста → таблото вече не е доказано', async () => {
    await publishScheme();
    const caseId = await newCase(w.portalAlfa, {
      deviceSerial: 'SN-ALFA-1',
      context: { errorCode: null },
    });
    const patched = await w.portalAlfa.patch(`/api/v1/cases/${caseId}/context`, {
      context: {
        productModel: MODEL,
        hardwareRevision: 'B',
        firmware: '4.2',
        serial: 'SN-ALTRO',
        errorCode: null,
      },
    });
    assert.equal(patched.status, 200);
    const answer = answerOf(await ask(w.portalAlfa, caseId, 'A cosa serve il relè K9?'));
    assert.equal(JSON.stringify(answer).includes('SCH-K9'), false);
    assert.ok(answer.missingData.includes('ctx.serial'));
  });

  test('собствената ревизия на таблото замества общата със същия код — без фалшив конфликт', async () => {
    const general = await publishDoc(w.ownerA1, {
      code: 'SCH-K9',
      revision: 'G',
      type: 'SCHEMATIC',
      pages: [
        { page: 3, text: 'Schema generale LTX-500: il relè K9 comanda la luce tramite X20.' },
      ],
    });
    const own = await publishScheme();
    const caseA = await newCase(w.portalAlfa, {
      deviceSerial: 'SN-ALFA-1',
      context: { errorCode: null },
    });
    const a = answerOf(await ask(w.portalAlfa, caseA, 'A cosa serve il relè K9?'));
    assert.notEqual(a.gate.evidenceLevel, 'conflict');
    const pack = lastPack();
    assert.equal(pack.find((p) => p.documentId === own)?.applicable, true);
    assert.equal(pack.find((p) => p.documentId === general)?.applicable, false);
    assert.match(h.model.texts.at(-1) ?? '', /"replacedByBoard":true/);
    // Друго табло: само общата — тя важи за него.
    const caseB = await newCase(w.portalAlfa, {
      deviceSerial: 'SN-ALFA-2',
      context: { errorCode: null },
    });
    answerOf(await ask(w.portalAlfa, caseB, 'A cosa serve il relè K9?'));
    assert.deepEqual(
      lastPack()
        .filter((p) => p.documentCode === 'SCH-K9')
        .map((p) => [p.documentId, p.applicable]),
      [[general, true]],
    );
  });

  test('визуализаторът: схемата на табло на Alfa — не за портала на Beta; персоналът я вижда', async () => {
    const id = await publishScheme();
    for (const [c, status] of [
      [w.portalAlfa, 200],
      [w.support, 200],
      [w.internal, 200],
      [w.portalBeta, 404],
      [w.portalB, 404],
    ] as const) {
      assert.equal((await c.get(`/api/v1/documents/${id}/pages/3`)).status, status);
      assert.equal((await c.get(`/api/v1/documents/${id}/source`)).status, status);
    }
  });

  test('„документи на това табло“: само вързаните за серийния номер; чужд клиент 404', async () => {
    const id = await publishScheme();
    const list = await w.ownerA1.get('/api/v1/admin/devices/SN-ALFA-1/documents');
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.documents.map((d: { id: string }) => d.id),
      [id],
    );
    assert.deepEqual(list.body.documents[0].applicability, [
      {
        productModel: MODEL,
        hwRevision: null,
        fwMin: null,
        fwMax: null,
        allFirmware: true,
        deviceSerial: 'SN-ALFA-1',
        options: {},
      },
    ]);
    assert.equal(list.body.documents[0].boardSpecific, true);
    assert.deepEqual(
      (await w.ownerA1.get('/api/v1/admin/devices/SN-ALFA-2/documents')).body.documents,
      [],
    );
    assert.equal((await w.ownerA1.get('/api/v1/admin/devices/NEMA/documents')).status, 404);
    assert.equal((await w.ownerB.get('/api/v1/admin/devices/SN-ALFA-1/documents')).status, 404);
    assert.equal((await w.support.get('/api/v1/admin/devices/SN-ALFA-1/documents')).status, 403);
  });
});

describe('валидност (§7.2 effectiveFrom/effectiveTo)', () => {
  test('изтекъл и още невалиден документ: не е източник, личи в отговора, моделът не се вика', async () => {
    await publishDoc(w.ownerA1, {
      code: 'BULL-FUSE',
      type: 'BULLETIN',
      effectiveFrom: '2025-01-01T00:00:00.000Z',
      effectiveTo: '2025-06-30T23:59:59.000Z',
      pages: [{ page: 1, text: 'Per il codice E55 sostituire il fusibile ORSA F3.' }],
    });
    await publishDoc(w.ownerA1, {
      code: 'BULL-FUT',
      type: 'BULLETIN',
      effectiveFrom: '2099-01-01T00:00:00.000Z',
      pages: [{ page: 1, text: 'Per il codice E56 aggiornare la configurazione LINCE.' }],
    });
    const caseId = await newCase(w.portalAlfa, {
      deviceSerial: 'SN-ALFA-1',
      context: { errorCode: null },
    });
    const expired = answerOf(await ask(w.portalAlfa, caseId, 'E55'));
    assert.equal(expired.status, 'undetermined');
    assert.ok(expired.gate.decisions.includes('kb.sourceExpired:BULL-FUSE@A'));
    assert.equal(JSON.stringify(expired).includes('ORSA'), false);
    const future = answerOf(await ask(w.portalAlfa, caseId, 'E56'));
    assert.ok(future.gate.decisions.includes('kb.sourceNotYetEffective:BULL-FUT@A'));
    assert.equal(h.model.calls, 0, 'без съвместим източник моделът не се вика (AC-04)');
  });

  test('задължителни метаданни при качване: effectiveFrom, ред на датите, изричен фърмуер → 400', async () => {
    const base = docBody({ code: 'DOC-META', pages: [{ page: 1, text: 'x' }] });
    const { effectiveFrom: _f, ...noFrom } = base;
    const cases: Array<[object, string]> = [
      [noFrom, 'effectiveFrom'],
      [{ ...base, effectiveTo: '2025-01-01T00:00:00.000Z' }, 'effectiveTo'],
      [{ ...base, applicability: [{ productModel: MODEL }] }, 'applicability.0.allFirmware'],
    ];
    for (const [body, path] of cases) {
      const r = await w.ownerA1.post('/api/v1/admin/documents', body);
      assert.equal(r.status, 400, path);
      assert.ok(
        r.body.issues.some((i: { path: string }) => i.path === path),
        JSON.stringify(r.body),
      );
    }
    const ok = await w.ownerA1.post('/api/v1/admin/documents', base);
    assert.equal(ok.status, 201);
    const stored = await db.document.findUniqueOrThrow({
      where: { id: ok.body.documentId },
      include: { applicability: true },
    });
    assert.equal(stored.effectiveFrom.toISOString(), base.effectiveFrom);
    assert.deepEqual(
      stored.applicability.map((a) => [a.allFirmware, a.fwMin, a.deviceId]),
      [[true, null, null]],
    );
  });
});
