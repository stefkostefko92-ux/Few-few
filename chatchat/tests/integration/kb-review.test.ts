import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import { MODEL, seedWorld, uploadDoc, type World } from './world.js';

/**
 * Преглед преди публикуване и сравнение на ревизии (§4.1): детайлът на черновата (страници с
 * компонентите, ревизиите на кода, история, оригинал), страница с извлечените парчета и
 * сравнението на две ревизии на един код — метаданни, приложимост, текст по страници, компоненти.
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

describe('детайл на документ (kb:manage)', () => {
  test('чернова: страниците с компонентите, ревизиите на кода, кодовете с източника, история', async () => {
    const id = await uploadDoc(w.ownerA1, {
      code: 'MAN-500',
      revision: 'C',
      supersedesRevision: 'B',
      applicability: [{ productModel: MODEL, fwMin: '5.0', deviceSerial: 'SN-ALFA-2' }],
      pages: [
        { page: 4, text: 'Revisione C: il relè K1 alimenta il morsetto X3.' },
        { page: 7, text: 'Pagina aggiunta sul contattore K2.' },
      ],
    });
    const res = await w.ownerA2.get(`/api/v1/admin/documents/${id}`);
    assert.equal(res.status, 200);
    const d = res.body;
    assert.deepEqual(
      [
        d.document.status,
        d.document.validity,
        d.document.boardSpecific,
        d.document.fourEyesBlocked,
      ],
      ['DRAFT', 'effective', true, false],
    );
    assert.deepEqual(d.document.applicability, [
      {
        productModel: MODEL,
        hwRevision: null,
        fwMin: '5.0',
        fwMax: null,
        allFirmware: false,
        deviceSerial: 'SN-ALFA-2',
        options: {},
      },
    ]);
    assert.deepEqual(d.pages, [
      { page: 4, chunks: 1, components: ['K1', 'X3'] },
      { page: 7, chunks: 1, components: ['K2'] },
    ]);
    assert.deepEqual(
      d.revisions
        .map((r: { revision: string; current: boolean }) => [r.revision, r.current])
        .sort(),
      [
        ['A', false],
        ['B', false],
        ['C', true],
      ],
    );
    assert.equal(d.document.supersedesId, w.docs.manFw5);
    assert.deepEqual(d.source, { available: false });
    assert.deepEqual(
      d.history.map((x: { action: string; actor: { name: string } }) => [x.action, x.actor.name]),
      [['kb.document.upload', 'Owner Uno']],
    );
    const errList = await w.ownerA1.get(`/api/v1/admin/documents/${w.docs.errList}`);
    assert.equal(errList.body.errors.length, 4, 'кодовете с този източник');
    const page = await w.ownerA2.get(`/api/v1/admin/documents/${id}/pages/4`);
    assert.deepEqual(page.body.chunks[0].componentRefs, ['K1', 'X3']);
    assert.equal((await w.ownerA2.get(`/api/v1/admin/documents/${id}/pages/99`)).status, 404);
  });

  test('документ по безопасност: качилият вижда предварително, че не може да публикува', async () => {
    const id = await uploadDoc(w.ownerA1, {
      code: 'PROC-X',
      type: 'PROCEDURE',
      safetyRelevant: true,
      pages: [{ page: 1, text: 'Procedura.' }],
    });
    await w.ownerA2.post(`/api/v1/admin/documents/${id}/submit`);
    const view = async (c: typeof w.ownerA1) =>
      (await c.get(`/api/v1/admin/documents/${id}`)).body.document.fourEyesBlocked;
    assert.equal(await view(w.ownerA1), true, 'качилият');
    assert.equal(await view(w.ownerA2), true, 'пратилият за преглед');
    const list = await w.ownerA1.get('/api/v1/admin/documents?code=PROC-X');
    assert.deepEqual(
      list.body.documents.map((x: { code: string; fourEyesBlocked: boolean }) => [
        x.code,
        x.fourEyesBlocked,
      ]),
      [['PROC-X', true]],
    );
  });
});

describe('сравнение на две ревизии', () => {
  test('MAN-500 A ↔ B: метаданни, приложимост, страници (редова разлика), компоненти', async () => {
    const res = await w.ownerA1.get(
      `/api/v1/admin/documents/compare?a=${w.docs.manFw4}&b=${w.docs.manFw5}`,
    );
    assert.equal(res.status, 200);
    const c = res.body;
    assert.deepEqual([c.a.revision, c.b.revision], ['A', 'B']);
    assert.deepEqual(
      c.metadata.map((m: { field: string }) => m.field),
      ['checksum'],
    );
    assert.deepEqual(c.applicability, {
      onlyA: ['LTX-500 · HW * · FW 4.0–4.9 · SN *'],
      onlyB: ['LTX-500 · HW * · FW 5.0– · SN *'],
      both: [],
    });
    assert.deepEqual(
      c.pages.map((p: { page: number; status: string }) => [p.page, p.status]),
      [
        [4, 'changed'],
        [5, 'removed'],
      ],
    );
    assert.deepEqual(
      c.pages[0].lines.map((l: { op: string }) => l.op),
      ['-', '+'],
    );
    assert.deepEqual(c.components, { onlyA: ['X3'], onlyB: [], both: ['E37'] });
    assert.equal(c.truncated, false);
  });

  test('различни кодове или същият документ → 400; непознат/чужд → 404', async () => {
    const q = (a: string, b: string) => `/api/v1/admin/documents/compare?a=${a}&b=${b}`;
    assert.equal((await w.ownerA1.get(q(w.docs.manFw4, w.docs.errList))).status, 400);
    assert.equal((await w.ownerA1.get(q(w.docs.manFw4, w.docs.manFw4))).status, 400);
    assert.equal((await w.ownerA1.get(q(w.docs.manFw4, w.docs.tenantB))).status, 404);
    assert.equal((await w.ownerA1.get(q(w.docs.manFw4, 'nema'))).status, 404);
    assert.equal(
      (await w.ownerA1.get(`/api/v1/admin/documents/compare?a=${w.docs.manFw4}`)).status,
      400,
    );
  });
});
