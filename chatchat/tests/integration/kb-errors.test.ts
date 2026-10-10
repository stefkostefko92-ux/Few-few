import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, makeUser, resetDb, signIn, startApp, type Client, type Harness } from './helpers.js';
import { MODEL, seedWorld, type World } from './world.js';

/**
 * Кодовете за грешка (FR-04): редакция на чернова, преглед, публикуване с ЧЕТИРИ ОЧИ за версия,
 * свързана с безопасността, отписване/възстановяване с причина, нова версия от публикувана —
 * версиите се пазят. Всяко действие е в одита (без съдържание); чужд клиент 404, без право 403.
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

async function draft(c: Client, over: object = {}): Promise<string> {
  const res = await c.post('/api/v1/admin/errors', {
    productModel: MODEL,
    code: 'E91',
    title: 'Porta bloccata',
    description: 'Il contatto porta non si chiude (E91).',
    severity: 'FAULT',
    safetyRelevant: false,
    sourceDocumentId: w.docs.errList,
    relations: [{ kind: 'CAUSE', text: 'Contatto porta sporco' }],
    ...over,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.errorId as string;
}
const row = (id: string) =>
  db.errorCode.findUniqueOrThrow({ where: { id }, include: { relations: true } });
const actions = (id: string) =>
  db.auditEvent
    .findMany({ where: { objectType: 'error', objectId: id }, orderBy: { id: 'asc' } })
    .then((xs) => xs.map((x) => x.action));

describe('редакция на чернова (PATCH)', () => {
  test('полетата и връзките се сменят; редакторът става автор; одитът — само имената на полетата', async () => {
    const id = await draft(w.ownerA1);
    const res = await w.ownerA2.patch(`/api/v1/admin/errors/${id}`, {
      title: 'Porta bloccata (rivisto)',
      fwMin: '4.0',
      subsystem: null,
      relations: [
        { kind: 'CAUSE', text: 'Contatto porta ossidato' },
        { kind: 'CHECK', text: 'Verificare il contatto porta', actionClass: 'DIAGNOSTIC' },
      ],
    });
    assert.equal(res.status, 204, JSON.stringify(res.body));
    const e = await row(id);
    assert.deepEqual([e.title, e.fwMin, e.status], ['Porta bloccata (rivisto)', '4.0', 'DRAFT']);
    assert.deepEqual(e.relations.map((r) => r.text).sort(), [
      'Contatto porta ossidato',
      'Verificare il contatto porta',
    ]);
    assert.deepEqual(e.authorIds, [w.users.ownerA1.id, w.users.ownerA2.id].sort());
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'kb.error.update' } });
    assert.deepEqual((audit.detail as { fields: string[] }).fields, [
      'fwMin',
      'relations',
      'subsystem',
      'title',
    ]);
    assert.equal(JSON.stringify(audit.detail).includes('ossidato'), false, 'без съдържание');
  });

  test('само чернова; непознат източник 422; непознато поле 400; чужд 404; без право 403', async () => {
    const id = await draft(w.ownerA1);
    const bad = await w.ownerA1.patch(`/api/v1/admin/errors/${id}`, {
      sourceDocumentId: w.docs.tenantB,
    });
    assert.deepEqual([bad.status, bad.body.code], [422, 'unknown_source_document']);
    // Източник само за друг модел не е източник за този код — нито при редакция, нито при създаване.
    const other = await w.ownerA1.patch(`/api/v1/admin/errors/${id}`, {
      sourceDocumentId: w.docs.otherProduct,
    });
    assert.deepEqual([other.status, other.body.code], [422, 'source_not_applicable']);
    const created = await w.ownerA1.post('/api/v1/admin/errors', {
      productModel: MODEL,
      code: 'E92',
      title: 'Altro',
      description: 'Altro modello',
      severity: 'INFO',
      safetyRelevant: false,
      sourceDocumentId: w.docs.otherProduct,
      relations: [],
    });
    assert.deepEqual([created.status, created.body.code], [422, 'source_not_applicable']);
    assert.equal(
      (await w.ownerA1.patch(`/api/v1/admin/errors/${id}`, { status: 'PUBLISHED' })).status,
      400,
    );
    assert.equal(
      (await w.ownerA1.patch(`/api/v1/admin/errors/${id}`, { code: 'E92' })).status,
      400,
    );
    assert.equal(
      (await w.ownerB.patch(`/api/v1/admin/errors/${id}`, { title: 'Altro' })).status,
      404,
    );
    for (const c of [w.support, w.portalAlfa, w.tenantAdmin]) {
      assert.equal((await c.patch(`/api/v1/admin/errors/${id}`, { title: 'Altro' })).status, 403);
    }
    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${id}/submit`)).status, 204);
    const locked = await w.ownerA1.patch(`/api/v1/admin/errors/${id}`, { title: 'Tardi' });
    assert.deepEqual([locked.status, locked.body.code], [409, 'invalid_transition']);
    const published = await w.ownerA1.patch(`/api/v1/admin/errors/${w.errors.e38}`, {
      title: 'No',
    });
    assert.deepEqual([published.status, published.body.code], [409, 'invalid_transition']);
  });
});

describe('четири очи за версия, свързана с безопасността', () => {
  test('флаг за безопасност: авторът (създал/пратил) не публикува; друг — да', async () => {
    const id = await draft(w.ownerA1, { safetyRelevant: true });
    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${id}/submit`)).status, 204);
    const self = await w.ownerA1.post(`/api/v1/admin/errors/${id}/publish`);
    assert.deepEqual([self.status, self.body.code], [409, 'four_eyes_required']);
    assert.equal((await row(id)).status, 'REVIEW');
    assert.equal((await w.ownerA2.post(`/api/v1/admin/errors/${id}/publish`)).status, 204);
    const e = await row(id);
    assert.deepEqual([e.status, e.approvedById], ['PUBLISHED', w.users.ownerA2.id]);
  });

  test('проверка SAFETY_RELEVANT без флага; редакторът също е автор → трети човек публикува', async () => {
    const id = await draft(w.ownerA1, {
      relations: [
        {
          kind: 'CHECK',
          text: 'Verificare la catena di sicurezza',
          actionClass: 'SAFETY_RELEVANT',
        },
      ],
    });
    assert.equal(
      (await w.ownerA2.patch(`/api/v1/admin/errors/${id}`, { title: 'Catena' })).status,
      204,
    );
    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${id}/submit`)).status, 204);
    for (const c of [w.ownerA1, w.ownerA2]) {
      const r = await c.post(`/api/v1/admin/errors/${id}/publish`);
      assert.deepEqual([r.status, r.body.code], [409, 'four_eyes_required']);
    }
    const third = await signIn(
      h,
      await makeUser({ tenantId: w.tenantA.id, role: 'KNOWLEDGE_OWNER' }),
    );
    assert.equal((await third.post(`/api/v1/admin/errors/${id}/publish`)).status, 204);
  });

  test('без безопасност авторът сам публикува; от чернова не се публикува (409)', async () => {
    const id = await draft(w.ownerA1);
    const early = await w.ownerA1.post(`/api/v1/admin/errors/${id}/publish`);
    assert.deepEqual([early.status, early.body.code], [409, 'invalid_transition']);
    await w.ownerA1.post(`/api/v1/admin/errors/${id}/submit`);
    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${id}/publish`)).status, 204);
    assert.deepEqual(await actions(id), ['kb.error.create', 'kb.error.submit', 'kb.error.publish']);
  });
});

describe('отписване, възстановяване, нова версия — версиите се пазят', () => {
  test('отписване с причина → възстановяване (с причина) → публикуване; върнато след възстановяване → DEPRECATED', async () => {
    const id = w.errors.e38;
    const bare = await w.ownerA1.post(`/api/v1/admin/errors/${id}/deprecate`);
    assert.deepEqual([bare.status, bare.body.code], [400, 'invalid_input']);
    const reason = { reason: 'Codice ritirato, contattare 3471234567' };
    assert.equal(
      (await w.ownerA1.post(`/api/v1/admin/errors/${id}/deprecate`, reason)).status,
      204,
    );
    assert.equal((await row(id)).status, 'DEPRECATED');
    const lookup = await w.portalAlfa.get('/api/v1/errors/E38?model=LTX-500&fw=4.2');
    assert.deepEqual(lookup.body.errors, []);
    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${id}/restore`)).status, 400);
    assert.equal((await w.ownerA2.post(`/api/v1/admin/errors/${id}/restore`, reason)).status, 204);
    assert.equal((await row(id)).status, 'REVIEW');
    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${id}/reject`)).status, 204);
    assert.equal((await row(id)).status, 'DEPRECATED', 'публикуваният не става чернова');
    await w.ownerA2.post(`/api/v1/admin/errors/${id}/restore`, reason);
    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${id}/publish`)).status, 204);
    const back = await w.portalAlfa.get('/api/v1/errors/E38?model=LTX-500&fw=4.2');
    assert.equal(back.body.errors.length, 1);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'kb.error.deprecate' } });
    assert.equal(
      JSON.stringify(audit.detail).includes('3471234567'),
      false,
      'причината е маскирана',
    );
  });

  test('нова версия от публикувана: чернова v+1 с връзките; публикуваната — непроменена', async () => {
    const id = w.errors.e37v1;
    const res = await w.ownerA2.post(`/api/v1/admin/errors/${id}/new-version`);
    assert.equal(res.status, 201);
    assert.equal(res.body.version, 3);
    const [copy, original] = await Promise.all([row(res.body.errorId), row(id)]);
    assert.deepEqual(
      [copy.status, copy.code, copy.fwMin, copy.fwMax, copy.authorIds],
      ['DRAFT', 'E37', '4.0', '4.9', [w.users.ownerA2.id]],
    );
    assert.deepEqual(
      copy.relations.map((r) => r.text).sort(),
      original.relations.map((r) => r.text).sort(),
    );
    assert.equal(original.status, 'PUBLISHED');
    // Публикуваната нова версия със същата валидност отписва старата (пази се).
    await w.ownerA2.patch(`/api/v1/admin/errors/${copy.id}`, { title: 'Guasto encoder (v3)' });
    await w.ownerA2.post(`/api/v1/admin/errors/${copy.id}/submit`);
    assert.equal((await w.ownerA1.post(`/api/v1/admin/errors/${copy.id}/publish`)).status, 204);
    assert.equal((await row(id)).status, 'DEPRECATED');
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'kb.error.publish', objectId: copy.id },
    });
    assert.deepEqual((audit.detail as { replaced: string[] }).replaced, [id]);
    assert.equal(await db.errorCode.count({ where: { code: 'E37', tenantId: w.tenantA.id } }), 3);
  });

  test('чужд клиент 404, без право 403 по всички действия', async () => {
    const id = w.errors.e38;
    for (const action of ['submit', 'reject', 'publish', 'deprecate', 'restore', 'new-version']) {
      const path = `/api/v1/admin/errors/${id}/${action}`;
      assert.equal((await w.ownerB.post(path, { reason: 'Prova' })).status, 404, action);
      for (const c of [w.support, w.portalAlfa]) {
        assert.equal((await c.post(path, { reason: 'Prova' })).status, 403, action);
      }
    }
    const detail = await w.ownerA1.get(`/api/v1/admin/errors/${id}`);
    assert.deepEqual(
      detail.body.history.map((x: { action: string }) => x.action),
      ['kb.error.create', 'kb.error.submit', 'kb.error.publish'],
    );
    assert.equal(detail.body.fourEyesBlocked, false);
  });
});
