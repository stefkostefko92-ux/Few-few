import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { Client, db, ORIGIN, PEPPER, resetDb, startApp, type Harness } from './helpers.js';
import { hashToken } from '../../src/crypto.js';
import { ask, baseContext, newCase, uploadDoc, type World, seedWorld } from './world.js';

/**
 * Знание и случаи около F2: ролята вместо името на служителя за портала (правният одит, т. 12),
 * QR етикет на таблото (FR-13), фърмуер извън ревизията, нова ревизия на документ → кодовете
 * за грешка в REVIEW → relink → публикуване (решение на собственика: не изчезват тихо).
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

type Msg = { kind: string; authorName: string | null; authorRole: string | null };
const authors = (messages: Msg[]) => messages.map((m) => [m.kind, m.authorName, m.authorRole]);

describe('Портален техник вижда ролята на служителя, не името', () => {
  test('authorRole винаги присъства: роля за чуждите, null за своите и за AI', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37');
    assert.equal((await w.support.post(`/api/v1/cases/${caseId}/assign`)).status, 200);
    const reply = await ask(w.support, caseId, 'Controlli il morsetto X3, per favore.', {
      askAi: false,
    });
    assert.equal(reply.status, 201);

    const portalView = await w.portalAlfa.get(`/api/v1/cases/${caseId}`);
    assert.deepEqual(authors(portalView.body.messages), [
      ['HUMAN', 'Tecnico Alfa', null],
      ['AI', null, null],
      ['HUMAN', null, 'SUPPORT'],
    ]);
    assert.equal(JSON.stringify(portalView.body).includes('Supporto'), false, 'името не изтича');

    const staffView = await w.support.get(`/api/v1/cases/${caseId}`);
    assert.deepEqual(authors(staffView.body.messages), [
      ['HUMAN', 'Tecnico Alfa', 'PORTAL_TECHNICIAN'],
      ['AI', null, null],
      ['HUMAN', 'Supporto', null],
    ]);
  });
});

describe('QR етикет на таблото (FR-13)', () => {
  test('нов токен: връща се веднъж; в базата само HMAC; справката следва видимостта', async () => {
    const res = await w.ownerA1.post('/api/v1/admin/devices/SN-ALFA-1/qr');
    assert.equal(res.status, 200);
    assert.match(res.body.url, new RegExp(`^${ORIGIN}/q/[A-Za-z0-9_-]{32}$`));
    assert.match(res.body.svg, /^<svg[\s\S]*<\/svg>\s*$/);
    const token = res.body.url.split('/q/')[1] as string;
    const device = await db.device.findFirstOrThrow({ where: { serial: 'SN-ALFA-1' } });
    assert.equal(device.qrTokenHash, hashToken(token, PEPPER));
    assert.equal(JSON.stringify(await db.auditEvent.findMany()).includes(token), false);
    assert.equal(await db.auditEvent.count({ where: { action: 'catalog.device.qr' } }), 1);

    for (const c of [w.portalAlfa, w.internal, w.support]) {
      const r = await c.get(`/api/v1/devices/by-qr/${token}`);
      assert.equal(r.status, 200);
      assert.deepEqual(
        [r.body.device.serial, r.body.device.productModel, r.body.device.hardwareRevision],
        ['SN-ALFA-1', 'LTX-500', 'B'],
      );
    }
    // Чужда фирма и чужд клиент: „няма такова“ — същото като за серийния номер.
    for (const c of [w.portalBeta, w.portalB, w.ownerB]) {
      assert.equal((await c.get(`/api/v1/devices/by-qr/${token}`)).status, 404);
    }
    assert.equal((await new Client(h.base).get(`/api/v1/devices/by-qr/${token}`)).status, 401);
  });

  test('нов етикет обезсилва стария; права и непознато табло', async () => {
    const first = (await w.ownerA1.post('/api/v1/admin/devices/SN-ALFA-1/qr')).body.url as string;
    const second = (await w.ownerA1.post('/api/v1/admin/devices/SN-ALFA-1/qr')).body.url as string;
    const tokenOf = (url: string) => url.split('/q/')[1] ?? '';
    assert.equal((await w.portalAlfa.get(`/api/v1/devices/by-qr/${tokenOf(first)}`)).status, 404);
    assert.equal((await w.portalAlfa.get(`/api/v1/devices/by-qr/${tokenOf(second)}`)).status, 200);
    assert.equal((await w.portalAlfa.get('/api/v1/devices/by-qr/bad')).status, 404);
    for (const c of [w.support, w.tenantAdmin, w.portalAlfa]) {
      assert.equal((await c.post('/api/v1/admin/devices/SN-ALFA-1/qr')).status, 403);
    }
    assert.equal((await w.ownerA1.post('/api/v1/admin/devices/NEMA/qr')).status, 404);
    assert.equal((await w.ownerB.post('/api/v1/admin/devices/SN-ALFA-1/qr')).status, 404);
  });

  test('уеб адресът /q/<токен> → 302 към приложението, без да издава съществуване', async () => {
    const url = (await w.ownerA1.post('/api/v1/admin/devices/SN-ALFA-1/qr')).body.url as string;
    const token = url.split('/q/')[1] ?? '';
    const go = (path: string) => fetch(h.base + path, { redirect: 'manual' });
    const real = await go(`/q/${token}`);
    const unknown = await go(`/q/${'A'.repeat(32)}`);
    assert.deepEqual([real.status, real.headers.get('location')], [302, `/?qr=${token}`]);
    assert.deepEqual(
      [unknown.status, unknown.headers.get('location')],
      [302, `/?qr=${'A'.repeat(32)}`],
    );
    assert.equal((await go('/q/%3Cscript%3E')).headers.get('location'), '/');
    const reset = await go('/reset');
    assert.equal(reset.status, 200);
    assert.match(reset.headers.get('content-type') ?? '', /html/);
  });
});

describe('Фърмуер извън обхвата на ревизията', () => {
  test('нов случай: предупреждение + събитие в хронологията (от системата); в обхвата — нищо', async () => {
    const outside = await w.internal.post('/api/v1/sessions', {
      context: { ...baseContext, hardwareRevision: 'B', firmware: '5.2' },
    });
    assert.equal(outside.status, 201);
    assert.deepEqual(outside.body.warnings, ['ctx.firmwareOutsideRevision']);
    const timeline = await w.internal.get(`/api/v1/cases/${outside.body.case.id}/timeline`);
    const event = timeline.body.events.find(
      (e: { type: string }) => e.type === 'context.firmwareOutsideRevision',
    );
    assert.equal(event.source, 'system');
    assert.deepEqual(event.payload, {
      hwRevision: 'B',
      firmware: '5.2',
      fwMin: '4.0',
      fwMax: '4.9',
    });

    const inside = await w.internal.post('/api/v1/sessions', { context: baseContext });
    assert.deepEqual(inside.body.warnings, []);
    const device = await w.portalAlfa.post('/api/v1/sessions', {
      context: baseContext,
      deviceSerial: 'SN-ALFA-2',
    });
    assert.deepEqual(device.body.warnings, [], 'C + 5.1 е в обхвата 5.0+');
  });

  test('смяна на контекста; непозната ревизия или фърмуер → без предупреждение', async () => {
    const caseId = await newCase(w.internal);
    const patch = (ctx: object) =>
      w.internal.patch(`/api/v1/cases/${caseId}/context`, { context: { ...baseContext, ...ctx } });
    assert.deepEqual((await patch({ firmware: '3.9' })).body.warnings, [
      'ctx.firmwareOutsideRevision',
    ]);
    assert.deepEqual((await patch({ hardwareRevision: 'Z', firmware: '9.9' })).body.warnings, []);
    assert.deepEqual((await patch({ firmware: null })).body.warnings, []);
    assert.deepEqual((await patch({ firmware: 'beta' })).body.warnings, []);
    const answer = await ask(w.internal, caseId, 'Errore E37');
    assert.equal(answer.status, 201, 'търсенето работи както преди');
  });
});

describe('Нова ревизия на документ: кодовете за грешка не изчезват тихо', () => {
  test('supersede → REVIEW (200 със списъка) → relink → publish', async () => {
    const newId = await uploadDoc(w.ownerA1, {
      code: 'ERR-LIST-500',
      revision: 'B',
      type: 'ERROR_LIST',
      supersedesRevision: 'A',
      pages: [
        { page: 1, text: 'Elenco aggiornato dei codici errore.' },
        { page: 2, text: 'E37: cavo encoder scollegato dal morsetto X3.' },
      ],
    });
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${newId}/submit`)).status, 204);
    const published = await w.ownerA1.post(`/api/v1/admin/documents/${newId}/publish`);
    assert.equal(published.status, 200);
    const e = w.errors;
    assert.deepEqual(
      published.body.errorsToReview.map((x: { id: string }) => x.id).sort(),
      [e.e37v1, e.e37v2, e.e38, e.e73].sort(),
    );
    assert.deepEqual(
      published.body.errorsToReview.map((x: { code: string; version: number }) => [
        x.code,
        x.version,
      ]),
      [
        ['E37', 1],
        ['E37', 2],
        ['E38', 1],
        ['E73', 1],
      ],
    );
    const statuses = await db.errorCode.findMany({
      select: { status: true },
      where: { tenantId: w.tenantA.id },
    });
    assert.ok(statuses.every((s) => s.status === 'REVIEW'));
    assert.equal(await db.auditEvent.count({ where: { action: 'kb.error.review_required' } }), 4);
    // AI и справката не ги виждат, докато са в преглед.
    const lookup = await w.portalAlfa.get('/api/v1/errors/E37?model=LTX-500&fw=4.2');
    assert.deepEqual(lookup.body.errors, []);

    const relink = await w.ownerA1.post(`/api/v1/admin/errors/${e.e37v1}/relink`, {
      sourceDocumentId: newId,
      sourcePage: 2,
    });
    assert.equal(relink.status, 200, JSON.stringify(relink.body));
    assert.deepEqual(relink.body, {
      errorId: e.e37v1,
      status: 'REVIEW',
      sourceDocumentId: newId,
      sourcePage: 2,
    });
    const relations = await db.errorRelation.findMany({ where: { errorId: e.e37v1 } });
    assert.ok(relations.length > 0);
    assert.ok(relations.every((r) => r.sourceDocumentId === newId && r.sourcePage === 2));

    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${e.e37v1}/publish`)).status, 204);
    const back = await w.portalAlfa.get('/api/v1/errors/E37?model=LTX-500&fw=4.2');
    assert.deepEqual(
      back.body.errors.map((x: { source: { revision: string; page: number } }) => [
        x.source.revision,
        x.source.page,
      ]),
      [['B', 2]],
    );
    // Без relink: източникът е отписан → не се публикува.
    const stale = await w.ownerA1.post(`/api/v1/admin/errors/${e.e38}/publish`);
    assert.deepEqual([stale.status, stale.body.code], [422, 'source_not_published']);
    // Публикуван код не се пресвързва тихо.
    const again = await w.ownerA1.post(`/api/v1/admin/errors/${e.e37v1}/relink`, {
      sourceDocumentId: newId,
    });
    assert.deepEqual([again.status, again.body.code], [409, 'invalid_transition']);
    assert.equal(await db.auditEvent.count({ where: { action: 'kb.error.relink' } }), 1);
  });

  test('relink: само към публикуван документ за същия продукт, в своя клиент', async () => {
    const e = w.errors.e73;
    await db.errorCode.update({ where: { id: e }, data: { status: 'REVIEW' } });
    const cases: Array<[string, number, string]> = [
      [w.docs.draft, 422, 'source_not_published'],
      [w.docs.otherProduct, 422, 'source_not_applicable'],
      [w.docs.tenantB, 422, 'unknown_source_document'],
    ];
    for (const [doc, status, code] of cases) {
      const r = await w.ownerA1.post(`/api/v1/admin/errors/${e}/relink`, { sourceDocumentId: doc });
      assert.deepEqual([r.status, r.body.code], [status, code], doc);
    }
    const foreign = await w.ownerB.post(`/api/v1/admin/errors/${e}/relink`, {
      sourceDocumentId: w.docs.tenantB,
    });
    assert.equal(foreign.status, 404);
    assert.equal((await w.support.post(`/api/v1/admin/errors/${e}/relink`, {})).status, 403);
    const ok = await w.ownerA1.post(`/api/v1/admin/errors/${e}/relink`, {
      sourceDocumentId: w.docs.manFw4,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.sourcePage, null);
  });
});
