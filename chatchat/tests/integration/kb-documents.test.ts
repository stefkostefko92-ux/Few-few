import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { runRetention } from '../../src/services/retention.js';
import { makePdf } from '../file-fixtures.js';
import { db, makeUser, resetDb, signIn, startApp, type Harness } from './helpers.js';
import { FakeScanner, SpyStore, uploadPdf, URL_KEY } from './files.js';
import { docBody, seedWorld, uploadDoc, type World } from './world.js';

/**
 * Жизненият цикъл на документа (решение на собственика: „старите документи се пазят, не се
 * обновяват“): отписването е изрично, с причина, обратимо (DEPRECATED → REVIEW → PUBLISHED с
 * четири очи за безопасност), нищо не се трие — нито от действие, нито от ретенцията; всяко
 * действие е в одита, причината е маскирана; достъпът — само kb:manage в своя клиент.
 */

let h: Harness;
let w: World;
const store = new SpyStore();

before(async () => {
  h = await startApp({ attachments: { store, scanner: new FakeScanner(), urlKey: URL_KEY } });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  store.reset();
  h.model.reset();
  w = await seedWorld(h);
});

const doc = (id: string) => db.document.findUniqueOrThrow({ where: { id } });
const audits = (action: string, objectId: string) =>
  db.auditEvent.findMany({ where: { action, objectId }, orderBy: { id: 'asc' } });

describe('отписване и възстановяване (обратимо, с причина)', () => {
  test('отписване: без причина 400; кодовете не изчезват тихо; възстановяване → кодовете се връщат', async () => {
    const id = w.docs.errList;
    const bare = await w.ownerA1.post(`/api/v1/admin/documents/${id}/deprecate`);
    assert.deepEqual([bare.status, bare.body.code], [400, 'invalid_input']);
    const res = await w.ownerA1.post(`/api/v1/admin/documents/${id}/deprecate`, {
      reason: 'Ritirato: segnalato da mario.rossi@example.com',
    });
    assert.equal(res.status, 200);
    const e = w.errors;
    assert.deepEqual(
      res.body.errorsAffected.map((x: { id: string }) => x.id).sort(),
      [e.e37v1, e.e37v2, e.e38, e.e73].sort(),
    );
    // Кодовете остават PUBLISHED (версиите се пазят), но AI/справката не ги виждат.
    const codes = await db.errorCode.findMany({ where: { tenantId: w.tenantA.id } });
    assert.ok(codes.every((c) => c.status === 'PUBLISHED'));
    const hidden = await w.portalAlfa.get('/api/v1/errors/E37?model=LTX-500&fw=4.2');
    assert.deepEqual(hidden.body.errors, []);
    const [audit] = await audits('kb.document.deprecate', id);
    const detail = audit?.detail as { reason: string; errorsAffected: string[] };
    assert.equal(detail.reason.includes('mario.rossi'), false, 'причината е маскирана');
    assert.equal(detail.errorsAffected.length, 4);
    // Нищо не е изтрито.
    assert.equal((await doc(id)).status, 'DEPRECATED');
    assert.equal(await db.documentChunk.count({ where: { documentId: id } }), 1);

    const noReason = await w.ownerA1.post(`/api/v1/admin/documents/${id}/restore`);
    assert.deepEqual([noReason.status, noReason.body.code], [400, 'invalid_input']);
    const restored = await w.ownerA1.post(`/api/v1/admin/documents/${id}/restore`, {
      reason: 'Elenco ancora valido per i quadri esistenti',
    });
    assert.equal(restored.status, 204);
    const back = await doc(id);
    assert.deepEqual(
      [back.status, back.submittedById, back.deprecatedAt],
      ['REVIEW', w.users.ownerA1.id, null],
    );
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${id}/publish`)).status, 204);
    const visible = await w.portalAlfa.get('/api/v1/errors/E37?model=LTX-500&fw=4.2');
    assert.equal(visible.body.errors.length, 2, 'кодовете се връщат с източника си');
    assert.equal((await audits('kb.document.restore', id)).length, 1);
  });

  test('документ по безопасност: възстановилият и качилият не го публикуват (четири очи)', async () => {
    const id = w.docs.procedure; // качен от ownerA1, публикуван от ownerA2
    const reason = { reason: 'Procedura sostituita' };
    assert.equal(
      (await w.ownerA2.post(`/api/v1/admin/documents/${id}/deprecate`, reason)).status,
      200,
    );
    assert.equal(
      (await w.ownerA2.post(`/api/v1/admin/documents/${id}/restore`, reason)).status,
      204,
    );
    for (const c of [w.ownerA2, w.ownerA1]) {
      const r = await c.post(`/api/v1/admin/documents/${id}/publish`);
      assert.deepEqual([r.status, r.body.code], [409, 'four_eyes_required']);
    }
    const third = await makeUser({ tenantId: w.tenantA.id, role: 'KNOWLEDGE_OWNER' });
    const ownerA3 = await signIn(h, third);
    assert.equal((await ownerA3.post(`/api/v1/admin/documents/${id}/publish`)).status, 204);
    const done = await doc(id);
    assert.deepEqual([done.status, done.approvedById], ['PUBLISHED', third.id]);
  });

  test('отхвърлен след възстановяване → обратно DEPRECATED (не чернова: неизменим е)', async () => {
    const id = w.docs.manFw5;
    const reason = { reason: 'Verifica' };
    await w.ownerA1.post(`/api/v1/admin/documents/${id}/deprecate`, reason);
    await w.ownerA1.post(`/api/v1/admin/documents/${id}/restore`, reason);
    assert.equal((await w.ownerA2.post(`/api/v1/admin/documents/${id}/reject`)).status, 204);
    assert.equal((await doc(id)).status, 'DEPRECATED');
    // Чернова, отхвърлена при преглед — в DRAFT (никога не е публикувана).
    const draft = await uploadDoc(w.ownerA1, { code: 'FAQ-R', pages: [{ page: 1, text: 'x' }] });
    await w.ownerA1.post(`/api/v1/admin/documents/${draft}/submit`);
    assert.equal(
      (await w.ownerA2.post(`/api/v1/admin/documents/${draft}/reject`, { reason: 'Incompleto' }))
        .status,
      204,
    );
    assert.equal((await doc(draft)).status, 'DRAFT');
    const [rejected] = await audits('kb.document.reject', draft);
    assert.deepEqual(rejected?.detail, {
      code: 'FAQ-R',
      revision: 'A',
      supersedes: null,
      to: 'DRAFT',
      reason: 'Incompleto',
    });
  });

  test('неизменими: няма PATCH/PUT/DELETE на документ; невалидните преходи — 409', async () => {
    const id = w.docs.manFw4;
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      const r = await w.ownerA1.req(method, `/api/v1/admin/documents/${id}`, { title: 'Nuovo' });
      assert.equal(r.status, 404, method);
    }
    assert.equal((await doc(id)).title, 'Documento MAN-500');
    const reason = { reason: 'Prova' };
    for (const action of ['restore', 'submit', 'reject']) {
      const r = await w.ownerA1.post(`/api/v1/admin/documents/${id}/${action}`, reason);
      assert.deepEqual([r.status, r.body.code], [409, 'invalid_transition'], action);
    }
  });
});

describe('достъп: само kb:manage в своя клиент', () => {
  test('чужд клиент → 404; без право → 403; портал → 403', async () => {
    const id = w.docs.manFw4;
    const paths = [
      ['GET', `/api/v1/admin/documents/${id}`],
      ['GET', `/api/v1/admin/documents/${id}/pages/4`],
      ['GET', `/api/v1/admin/documents/compare?a=${id}&b=${w.docs.manFw5}`],
      ['POST', `/api/v1/admin/documents/${id}/deprecate`],
      ['POST', `/api/v1/admin/documents/${id}/restore`],
    ] as const;
    for (const [method, path] of paths) {
      const body = method === 'POST' ? { reason: 'Prova' } : undefined;
      assert.equal((await w.ownerB.req(method, path, body)).status, 404, `B ${path}`);
      for (const c of [w.support, w.portalAlfa, w.tenantAdmin, w.internal]) {
        assert.equal((await c.req(method, path, body)).status, 403, path);
      }
    }
    assert.equal(await db.auditEvent.count({ where: { action: 'kb.document.deprecate' } }), 0);
  });
});

describe('ретенцията не трие знание', () => {
  test('документи (вкл. отписани), парчетата и оригиналите остават след ретенцията', async () => {
    const pdf = makePdf([['Schema ritirata ORIGINALE con il morsetto X9.']]);
    const up = (await uploadPdf(w.ownerA1, pdf, 'SCH-RET.pdf')).body.attachment.id as string;
    const { pages: _p, sourceFilename: _s, ...meta } = docBody({ code: 'SCH-RET', pages: [] });
    const created = await w.ownerA1.post('/api/v1/admin/documents', {
      ...meta,
      sourceAttachmentId: up,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.documentId as string;
    await w.ownerA1.post(`/api/v1/admin/documents/${id}/submit`);
    await w.ownerA1.post(`/api/v1/admin/documents/${id}/publish`);
    await w.ownerA1.post(`/api/v1/admin/documents/${id}/deprecate`, { reason: 'Ritirato' });
    const before = {
      documents: await db.document.count(),
      chunks: await db.documentChunk.count(),
      rules: await db.documentApplicability.count(),
    };
    // Години по-късно, с триене на затворените случаи: знанието остава.
    const later = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000);
    await runRetention(db, store, { sessionDays: 1, caseDays: 0, now: later });
    assert.deepEqual(
      {
        documents: await db.document.count(),
        chunks: await db.documentChunk.count(),
        rules: await db.documentApplicability.count(),
      },
      before,
    );
    const original = await db.attachment.findUniqueOrThrow({ where: { id: up } });
    assert.ok(await store.get(original.objectKey), 'оригиналът е в хранилището');
    assert.equal((await doc(id)).status, 'DEPRECATED');
  });
});
