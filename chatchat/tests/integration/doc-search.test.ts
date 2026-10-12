import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, resetDb, startApp, type Client, type Harness } from './helpers.js';
import {
  answerOf,
  ask,
  MODEL,
  newCase,
  publishDoc,
  publishError,
  seedWorld,
  TEXT,
  type World,
} from './world.js';

/**
 * FR-03 (търсене на документи извън чата), бързият преглед на код (§12.1) и FR-01 (опциите на
 * таблото): същите филтри като AI — клиент, аудитория, PUBLISHED, валидност, табло, опции.
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

type Hit = {
  documentId: string;
  code: string;
  revision: string;
  page: number;
  applicable: boolean | null;
  boardSpecific: boolean;
  options: Array<Record<string, string>>;
  snippet: string | null;
};
const search = (c: Client, params: Record<string, string>) =>
  c.get<{ results: Hit[]; board: unknown; code?: string }>(
    `/api/v1/documents/search?${new URLSearchParams(params).toString()}`,
  );
const codes = (hits: Hit[]) => hits.map((x) => `${x.code}@${x.revision}`).sort();

/** Табло с опции (FR-01) — през административното API. */
async function deviceWithOptions(serial: string, options: Record<string, string>) {
  const res = await w.ownerA1.post('/api/v1/admin/devices', {
    serial,
    productModel: MODEL,
    hwRevision: 'B',
    firmware: '4.2',
    companyName: 'Alfa Srl',
    options,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
}

describe('търсене на документи (FR-03)', () => {
  test('текст + модел: само публикуваното в аудиторията; приложимост по HW/FW; страница и откъс', async () => {
    const res = await search(w.portalAlfa, { q: 'encoder', model: MODEL, hw: 'B', fw: '4.2' });
    assert.equal(res.status, 200);
    const hit = res.body.results.find((x) => x.code === 'MAN-500' && x.revision === 'A');
    assert.ok(hit, JSON.stringify(res.body));
    assert.equal(hit.page, 4);
    assert.match(hit.snippet ?? '', /encoder/);
    assert.equal(hit.applicable, true);
    for (const hidden of ['INT-BULL-001', 'MAN-DRAFT', 'FAQ-900']) {
      assert.equal(
        res.body.results.some((x) => x.code === hidden),
        false,
        hidden,
      );
    }
    assert.equal(JSON.stringify(res.body).includes('TENANT-B-SECRET'), false);
    // Ревизията за FW5 е в сила, но неприложима за 4.2 — личи, не се крие.
    const all = await search(w.portalAlfa, { model: MODEL, fw: '4.2', q: 'E37' });
    const fw5 = all.body.results.find((x) => x.code === 'MAN-500' && x.revision === 'B');
    assert.equal(fw5?.applicable, false);
  });

  test('аудиторията: вътрешен вижда вътрешния бюлетин, порталът — не; чужд клиент — нищо от A', async () => {
    const q = { q: 'ARCOBALENO' };
    assert.deepEqual(codes((await search(w.internal, q)).body.results), ['INT-BULL-001@A']);
    assert.deepEqual((await search(w.portalAlfa, q)).body.results, []);
    const b = await search(w.portalB, { q: 'E37' });
    assert.deepEqual(codes(b.body.results), ['MAN-500@A']);
    assert.match(b.body.results[0]?.snippet ?? '', /TENANT-B-SECRET/);
  });

  test('филтри: тип, език, код в заглавието; невалиден вход → 400', async () => {
    const t = await search(w.portalAlfa, { type: 'PROCEDURE' });
    assert.deepEqual(codes(t.body.results), ['PROC-DOOR-001@A']);
    const byCode = await search(w.portalAlfa, { q: 'ERR-LIST' });
    assert.deepEqual(codes(byCode.body.results), ['ERR-LIST-500@A']);
    assert.deepEqual((await search(w.portalAlfa, { language: 'en' })).body.results, []);
    assert.equal((await search(w.portalAlfa, { type: 'ROMANZO' })).status, 400);
    assert.equal((await search(w.portalAlfa, { language: 'ita' })).status, 400);
    // „%“ е буква, не заместител.
    assert.deepEqual((await search(w.portalAlfa, { q: '%' })).body.results, []);
  });

  test('валидност: изтекъл или още невалиден документ не се намира', async () => {
    await publishDoc(w.ownerA1, {
      code: 'OLD-BULL',
      effectiveFrom: '2025-01-01T00:00:00.000Z',
      effectiveTo: '2025-06-30T23:59:59.000Z',
      pages: [{ page: 1, text: 'Bollettino scaduto ZAFFIRO.' }],
    });
    await publishDoc(w.ownerA1, {
      code: 'NEW-BULL',
      effectiveFrom: '2099-01-01T00:00:00.000Z',
      pages: [{ page: 1, text: 'Bollettino futuro ZAFFIRO.' }],
    });
    assert.deepEqual((await search(w.portalAlfa, { q: 'ZAFFIRO' })).body.results, []);
  });

  test('табло: само видимото за човека; схемата му — само с него; чуждо табло → 404', async () => {
    await publishDoc(w.ownerA1, {
      code: 'SCH-K9',
      revision: 'A1',
      type: 'SCHEMATIC',
      applicability: [{ productModel: MODEL, allFirmware: true, deviceSerial: 'SN-ALFA-1' }],
      pages: [{ page: 3, text: 'Schema SN-ALFA-1: il relè K9 comanda la ventola.' }],
    });
    const own = await search(w.portalAlfa, { serial: 'SN-ALFA-1', q: 'K9' });
    assert.equal(own.status, 200);
    assert.deepEqual(codes(own.body.results), ['SCH-K9@A1']);
    assert.equal(own.body.results[0]?.boardSpecific, true);
    assert.equal(own.body.results[0]?.applicable, true);
    assert.deepEqual((await search(w.portalAlfa, { q: 'K9', model: MODEL })).body.results, []);
    assert.deepEqual(
      (await search(w.portalAlfa, { serial: 'SN-ALFA-2', q: 'K9' })).body.results,
      [],
    );
    const beta = await search(w.portalAlfa, { serial: 'SN-BETA-1', q: 'K9' });
    assert.deepEqual([beta.status, beta.body.code], [404, 'device_not_found']);
    assert.equal((await search(w.portalB, { serial: 'SN-ALFA-1' })).status, 404);
    // Персоналът вижда всички табла на клиента.
    assert.equal((await search(w.support, { serial: 'SN-BETA-1', q: 'E37' })).status, 200);
  });
});

describe('опции на таблото (FR-01)', () => {
  async function optionDocs() {
    await publishDoc(w.ownerA1, {
      code: 'PAR-VF3',
      applicability: [{ productModel: MODEL, allFirmware: true, options: { inverter: 'VF-3' } }],
      pages: [{ page: 7, text: 'Con inverter VF-3 il parametro P41 imposta la rampa.' }],
    });
    await publishDoc(w.ownerA1, {
      code: 'PAR-X100',
      applicability: [{ productModel: MODEL, allFirmware: true, options: { inverter: 'X100' } }],
      pages: [{ page: 7, text: 'Con inverter X100 il parametro P41 imposta la frenatura.' }],
    });
  }

  test('търсенето с табло връща само документите за опциите му; без табло — с ограничението', async () => {
    await optionDocs();
    await deviceWithOptions('SN-VF3', { inverter: 'VF-3' });
    const withBoard = await search(w.portalAlfa, { serial: 'SN-VF3', q: 'P41' });
    assert.deepEqual(codes(withBoard.body.results), ['PAR-VF3@A']);
    const any = await search(w.portalAlfa, { model: MODEL, q: 'P41' });
    assert.deepEqual(codes(any.body.results), ['PAR-VF3@A', 'PAR-X100@A']);
    assert.deepEqual(
      any.body.results.map((x) => x.options),
      any.body.results.map((x) => [{ inverter: x.code === 'PAR-VF3' ? 'VF-3' : 'X100' }]),
    );
  });

  test('случай от табло: опциите влизат в контекста; AI цитира само документа за тях', async () => {
    await optionDocs();
    await deviceWithOptions('SN-VF3', { inverter: 'VF-3' });
    const res = await w.portalAlfa.post('/api/v1/sessions', {
      context: {
        productModel: MODEL,
        hardwareRevision: null,
        firmware: null,
        serial: null,
        errorCode: null,
        options: { cabina: 'vetro' },
      },
      deviceSerial: 'SN-VF3',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const ctx = res.body.case.context;
    assert.deepEqual(ctx.options, { cabina: 'vetro', inverter: 'VF-3' });
    const answer = answerOf(await ask(w.portalAlfa, res.body.case.id, 'Parametro P41?'));
    // Опциите са в контекста към модела (между маркерите) като технически данни.
    assert.match(h.model.texts.at(-1) ?? '', /"inverter": "VF-3"/);
    const pack = h.model.packs.at(-1) ?? [];
    const applicable = new Map(pack.map((p) => [p.documentCode, p.applicable]));
    assert.equal(applicable.get('PAR-VF3'), true);
    assert.equal(applicable.get('PAR-X100'), false);
    assert.deepEqual(
      answer.evidence.map((e: { documentCode: string }) => e.documentCode),
      ['PAR-VF3'],
    );
  });

  test('случай без опцията: моделът не се вика, отговорът иска „ctx.option:inverter“ (FR-07)', async () => {
    await optionDocs();
    const caseId = await newCase(w.portalAlfa, { context: { errorCode: null } });
    const answer = answerOf(await ask(w.portalAlfa, caseId, 'Parametro P41?'));
    assert.equal(h.model.calls, 0);
    assert.equal(answer.status, 'undetermined');
    assert.ok(answer.missingData.includes('ctx.option:inverter'), JSON.stringify(answer));
    // С опцията в контекста — документът за VF-3 е източник.
    await w.portalAlfa.patch(`/api/v1/cases/${caseId}/context`, {
      context: {
        productModel: MODEL,
        hardwareRevision: 'B',
        firmware: '4.2',
        serial: null,
        errorCode: null,
        phase: 'unknown',
        symptoms: [],
        observations: [],
        options: { inverter: 'VF-3' },
      },
    });
    const again = answerOf(await ask(w.portalAlfa, caseId, 'Parametro P41?'));
    assert.deepEqual(
      again.evidence.map((e: { documentCode: string }) => e.documentCode),
      ['PAR-VF3'],
    );
  });

  test('опциите се виждат в справката по сериен номер; редакция на правило — само обект', async () => {
    await deviceWithOptions('SN-VF3', { inverter: 'VF-3' });
    const dev = await w.portalAlfa.get('/api/v1/devices/SN-VF3');
    assert.deepEqual(dev.body.device.options, { inverter: 'VF-3' });
    const bad = await w.ownerA1.post('/api/v1/admin/documents', {
      code: 'PAR-BAD',
      title: 'Documento PAR-BAD',
      type: 'MANUAL',
      language: 'it',
      revision: 'A',
      audience: 'PORTAL',
      safetyRelevant: false,
      sourceFilename: 'x.pdf',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      applicability: [{ productModel: MODEL, allFirmware: true, options: { inverter: 3 } }],
      pages: [{ page: 1, text: 'x' }],
    });
    assert.equal(bad.status, 400);
  });

  test('PATCH на контекста с deviceSerial връзва таблото (FR-07) — само видимо; в одита', async () => {
    await deviceWithOptions('SN-VF3', { inverter: 'VF-3' });
    const caseId = await newCase(w.portalAlfa, { context: { hardwareRevision: null } });
    const base = {
      productModel: MODEL,
      hardwareRevision: null,
      firmware: null,
      serial: null,
      errorCode: 'E37',
      phase: 'unknown',
      symptoms: [],
      observations: [],
      options: {},
    };
    const foreign = await w.portalAlfa.patch(`/api/v1/cases/${caseId}/context`, {
      context: base,
      deviceSerial: 'SN-BETA-1',
    });
    assert.deepEqual([foreign.status, foreign.body.code], [404, 'device_not_found']);
    const bound = await w.portalAlfa.patch(`/api/v1/cases/${caseId}/context`, {
      context: base,
      deviceSerial: 'SN-VF3',
    });
    assert.equal(bound.status, 200, JSON.stringify(bound.body));
    const ctx = bound.body.case.context;
    assert.deepEqual(
      [ctx.serial, ctx.hardwareRevision, ctx.firmware, ctx.options],
      ['SN-VF3', 'B', '4.2', { inverter: 'VF-3' }],
    );
    const stored = await db.case.findUniqueOrThrow({ where: { id: caseId } });
    const device = await db.device.findFirstOrThrow({ where: { serial: 'SN-VF3' } });
    assert.equal(stored.deviceId, device.id);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'case.board' } });
    assert.deepEqual(audit.detail, { deviceId: device.id, previousDeviceId: null });
  });

  test('портален случай: поелият оператор не го връзва за табло на друга фирма (AC-18)', async () => {
    const caseId = await newCase(w.portalAlfa);
    assert.equal((await w.support.post(`/api/v1/cases/${caseId}/assign`)).status, 200);
    const context = {
      productModel: MODEL,
      hardwareRevision: 'B',
      firmware: '4.2',
      serial: null,
      errorCode: 'E37',
      phase: 'unknown',
      symptoms: [],
      observations: [],
      options: {},
    };
    const patch = (deviceSerial: string) =>
      w.support.patch(`/api/v1/cases/${caseId}/context`, { context, deviceSerial });
    const beta = await patch('SN-BETA-1');
    assert.deepEqual([beta.status, beta.body.code], [404, 'device_not_found']);
    assert.equal((await patch('SN-ALFA-1')).status, 200);
  });
});

describe('бърз преглед на код за грешка (§12.1)', () => {
  test('по модел + FW; по табло — от регистъра; връзка към източника', async () => {
    const res = await w.portalAlfa.get(`/api/v1/errors/E37?model=${MODEL}&fw=4.2`);
    assert.equal(res.status, 200);
    const byTitle = new Map(
      res.body.errors.map((e: { title: string; applicable: boolean }) => [e.title, e.applicable]),
    );
    assert.equal(byTitle.get('Guasto encoder'), true);
    assert.equal(byTitle.get('Sovratemperatura inverter'), false);
    assert.equal(res.body.errors[0].source.documentCode, 'ERR-LIST-500');
    assert.equal(res.body.errors[0].sourceValidity, 'effective');
    const viaBoard = await w.portalAlfa.get('/api/v1/errors/E37?serial=SN-ALFA-2');
    assert.equal(viaBoard.body.board.serial, 'SN-ALFA-2');
    const v = new Map(
      viaBoard.body.errors.map((e: { title: string; applicable: boolean }) => [
        e.title,
        e.applicable,
      ]),
    );
    assert.equal(v.get('Sovratemperatura inverter'), true, 'SN-ALFA-2 е с фърмуер 5.1');
    assert.equal((await w.portalAlfa.get('/api/v1/errors/E37')).status, 400);
    assert.equal((await w.portalAlfa.get('/api/v1/errors/E37?serial=SN-BETA-1')).status, 404);
  });

  test('код с източник САМО за табло A: само с това табло; изтекъл източник личи', async () => {
    const scheme = await publishDoc(w.ownerA1, {
      code: 'SCH-E90',
      type: 'SCHEMATIC',
      applicability: [{ productModel: MODEL, allFirmware: true, deviceSerial: 'SN-ALFA-1' }],
      pages: [{ page: 1, text: 'Schema SN-ALFA-1: E90 relè K90.' }],
    });
    await publishError(w.ownerA1, {
      code: 'E90',
      title: 'Relè K90',
      description: 'Solo sul quadro SN-ALFA-1 (E90).',
      sourceDocumentId: scheme,
    });
    const get = (q: string) => w.portalAlfa.get(`/api/v1/errors/E90?${q}`);
    assert.equal((await get('serial=SN-ALFA-1')).body.errors.length, 1);
    assert.equal((await get(`model=${MODEL}`)).body.errors.length, 0);
    assert.equal((await get('serial=SN-ALFA-2')).body.errors.length, 0);

    const expired = await publishDoc(w.ownerA1, {
      code: 'OLD-ERR',
      effectiveFrom: '2025-01-01T00:00:00.000Z',
      effectiveTo: '2025-06-30T23:59:59.000Z',
      pages: [{ page: 1, text: 'E91 vecchio elenco.' }],
    });
    await publishError(w.ownerA1, {
      code: 'E91',
      title: 'Vecchio E91',
      description: 'Elenco scaduto (E91).',
      sourceDocumentId: expired,
    });
    const e91 = await w.portalAlfa.get(`/api/v1/errors/E91?model=${MODEL}`);
    assert.deepEqual(
      [e91.body.errors[0].applicable, e91.body.errors[0].sourceValidity],
      [false, 'expired'],
    );
    // Текстът на документа на чуждия клиент не изтича и тук.
    assert.equal(JSON.stringify(e91.body).includes(TEXT.tenantB), false);
  });
});
