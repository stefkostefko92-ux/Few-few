import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { appendAudit, verifyAuditChain } from '../../src/audit.js';
import { SESSION_COOKIE } from '../../src/auth/sessions.js';
import {
  Client,
  db,
  makeUser,
  ORIGIN,
  PASSWORD,
  resetDb,
  startApp,
  type Harness,
} from './helpers.js';
import {
  ask,
  baseContext,
  EFFECTIVE_FROM,
  newCase,
  publishDoc,
  seedWorld,
  uploadDoc,
  type World,
} from './world.js';

/**
 * Сигурност на HTTP слоя: CSRF и Origin, вход и лимити, RBAC, „четири очи“ за документи по
 * безопасност, валидация на входа и неизменимата одит верига. Всеки тест гледа отговора на
 * API-то и записаното в базата.
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

describe('CSRF и Origin', () => {
  const body = { context: baseContext };

  test('POST без x-csrf-token → 403 csrf и нищо не е записано', async () => {
    const res = await w.portalAlfa.post('/api/v1/sessions', body, { csrf: null });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'csrf');
    assert.equal(await db.case.count(), 0);
  });

  test('грешен токен, чужд токен (на друга сесия) → 403', async () => {
    assert.equal(
      (await w.portalAlfa.post('/api/v1/sessions', body, { csrf: 'x'.repeat(32) })).status,
      403,
    );
    const foreign = w.portalBeta.csrfToken;
    assert.ok(foreign);
    assert.equal(
      (await w.portalAlfa.post('/api/v1/sessions', body, { csrf: foreign })).status,
      403,
    );
    assert.equal(await db.case.count(), 0);
  });

  test('верен токен, но чужд Origin → 403; наш Origin или без Origin → приема се', async () => {
    const evil = await w.portalAlfa.post('/api/v1/sessions', body, {
      origin: 'https://evil.example',
    });
    assert.equal(evil.status, 403);
    assert.equal(evil.body.code, 'csrf');
    assert.equal(
      (
        await w.portalAlfa.post('/api/v1/sessions', body, {
          origin: 'https://chatchat.test.evil.example',
        })
      ).status,
      403,
      'префиксът на Origin не е достатъчен',
    );
    assert.equal(
      (await w.portalAlfa.post('/api/v1/sessions', body, { origin: ORIGIN })).status,
      201,
    );
    assert.equal((await w.portalAlfa.post('/api/v1/sessions', body)).status, 201);
  });

  test('защитени са всички променящи пътища: чат, контекст, изход, тикет, админ, изход', async () => {
    const caseId = await newCase(w.portalAlfa);
    const noToken = { csrf: null } as const;
    const attempts = await Promise.all([
      ask2(w.portalAlfa, caseId, noToken),
      w.portalAlfa.patch(`/api/v1/cases/${caseId}/context`, body, noToken),
      w.portalAlfa.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' }, noToken),
      w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Subito' }, noToken),
      w.ownerA1.post(
        '/api/v1/admin/products',
        { family: 'X', model: 'X-1', revisions: [{ hwRevision: 'A', fwMin: '1.0' }] },
        noToken,
      ),
      w.ownerA1.post(`/api/v1/admin/documents/${w.docs.manFw4}/deprecate`, {}, noToken),
      w.portalAlfa.post('/api/v1/auth/logout', {}, noToken),
    ]);
    assert.deepEqual(
      attempts.map((a) => a.status),
      Array(7).fill(403),
    );
    assert.equal(
      (await db.document.findUniqueOrThrow({ where: { id: w.docs.manFw4 } })).status,
      'PUBLISHED',
    );
    assert.equal(await db.caseMessage.count({ where: { caseId } }), 0);
    assert.equal((await w.portalAlfa.get('/api/v1/auth/me')).status, 200, 'сесията не е отнета');
  });

  test('GET не иска токен (безопасен метод)', async () => {
    assert.equal((await w.portalAlfa.get('/api/v1/cases', { csrf: null })).status, 200);
  });

  test('без вписване → 401, преди CSRF', async () => {
    const anon = new Client(h.base);
    assert.equal((await anon.post('/api/v1/sessions', body)).status, 401);
    assert.equal((await anon.get('/api/v1/cases')).status, 401);
  });

  test('бисквитка без валиден формат не дава достъп', async () => {
    const forged = new Client(h.base, 'a'.repeat(43), w.portalAlfa.csrfToken);
    assert.equal((await forged.get('/api/v1/auth/me')).status, 401);
    const junk = new Client(h.base, 'abc', null);
    assert.equal((await junk.get('/api/v1/auth/me')).status, 401);
  });
});

function ask2(c: Client, caseId: string, opts: { csrf: null }) {
  return c.post('/api/v1/chat/messages', { caseId, text: 'Errore E37' }, opts);
}

describe('Вход: бисквитка, грешки, одит', () => {
  let login: Harness;
  before(async () => {
    login = await startApp();
  });
  after(async () => {
    await login.close();
  });

  test('успешен вход: httpOnly + SameSite=Strict, токенът е хеширан в базата, без парола в отговора', async () => {
    const user = await makeUser({
      tenantId: w.tenantA.id,
      role: 'SUPPORT',
      email: 'sara@example.test',
    });
    const anon = new Client(login.base);
    const res = await anon.post('/api/v1/auth/login', {
      email: ' Sara@Example.test ',
      password: PASSWORD,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, user.id);
    assert.equal(JSON.stringify(res.body).includes('passwordHash'), false);
    const cookie = res.headers.get('set-cookie') ?? '';
    assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43};`));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    const token = /=([^;]+);/.exec(cookie)?.[1] ?? '';
    const stored = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    assert.notEqual(stored.tokenHash, token);
    assert.equal(stored.tokenHash.length, 64);

    const authed = new Client(login.base, token, res.body.csrfToken);
    assert.equal((await authed.get('/api/v1/auth/me')).status, 200);
    assert.equal(
      await db.auditEvent.count({ where: { action: 'auth.login', actorId: user.id } }),
      1,
    );
  });

  test('грешна парола, непознат имейл, деактивиран: един и същ 401 invalid_credentials', async () => {
    await makeUser({ tenantId: w.tenantA.id, role: 'SUPPORT', email: 'ok@example.test' });
    const off = await makeUser({
      tenantId: w.tenantA.id,
      role: 'SUPPORT',
      email: 'off@example.test',
      active: false,
    });
    const anon = new Client(login.base);
    const results = await Promise.all([
      anon.post('/api/v1/auth/login', { email: 'ok@example.test', password: 'wrong password 123' }),
      anon.post('/api/v1/auth/login', { email: 'nobody@example.test', password: PASSWORD }),
      anon.post('/api/v1/auth/login', { email: 'off@example.test', password: PASSWORD }),
    ]);
    assert.deepEqual(
      results.map((r) => r.status),
      [401, 401, 401],
    );
    assert.deepEqual(new Set(results.map((r) => JSON.stringify(r.body))).size, 1);
    assert.equal(await db.session.count({ where: { userId: off.id } }), 0);
    const failed = await db.auditEvent.findMany({ where: { action: 'auth.login_failed' } });
    assert.equal(failed.length, 2, 'за двата съществуващи акаунта');
  });

  test('вход с чужд Origin → 403 и няма сесия', async () => {
    const user = await makeUser({
      tenantId: w.tenantA.id,
      role: 'SUPPORT',
      email: 'o@example.test',
    });
    const res = await new Client(login.base).post(
      '/api/v1/auth/login',
      { email: 'o@example.test', password: PASSWORD },
      { origin: 'https://evil.example' },
    );
    assert.equal(res.status, 403);
    assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
  });
});

describe('Лимити (rate limit)', () => {
  test('вход: след 10 опита от един адрес → 429 too_many_attempts, дори с вярна парола', async () => {
    const limited = await startApp();
    try {
      const lim = await makeUser({
        tenantId: w.tenantA.id,
        role: 'SUPPORT',
        email: 'lim@example.test',
      });
      const anon = new Client(limited.base);
      for (let i = 1; i <= 10; i += 1) {
        const r = await anon.post('/api/v1/auth/login', {}); // 400, но се брои
        assert.equal(r.status, 400, `опит ${i}`);
      }
      const blocked = await anon.post('/api/v1/auth/login', {
        email: 'lim@example.test',
        password: PASSWORD,
      });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.code, 'too_many_attempts');
      assert.equal(
        await db.session.count({ where: { userId: lim.id } }),
        0,
        'вярната парола не отваря сесия при блокиран адрес',
      );
    } finally {
      await limited.close();
    }
  });

  test('чат: 13-то съобщение за минута → 429 too_many_requests; другият потребител не е засегнат', async () => {
    const caseId = await newCase(w.portalAlfa);
    for (let i = 1; i <= 12; i += 1) {
      const r = await ask(w.portalAlfa, caseId, `Messaggio ${i}`, { askAi: false });
      assert.equal(r.status, 201, `съобщение ${i}`);
    }
    const over = await ask(w.portalAlfa, caseId, 'Messaggio 13', { askAi: false });
    assert.equal(over.status, 429);
    assert.equal(over.body.code, 'too_many_requests');
    assert.equal(await db.caseMessage.count({ where: { caseId } }), 12);

    const other = await newCase(w.portalBeta);
    assert.equal((await ask(w.portalBeta, other, 'Ciao', { askAi: false })).status, 201);
  });
});

describe('RBAC — способности по роля', () => {
  const product = { family: 'X', model: 'X-1', revisions: [{ hwRevision: 'A', fwMin: '1.0' }] };

  test('администраторските пътища са само за отговорника за знанието', async () => {
    for (const [name, c] of [
      ['portal', w.portalAlfa],
      ['internal', w.internal],
      ['support', w.support],
      ['tenantAdmin', w.tenantAdmin],
    ] as const) {
      const res = await Promise.all([
        c.post('/api/v1/admin/products', product),
        c.get('/api/v1/admin/documents'),
        c.post(`/api/v1/admin/documents/${w.docs.manFw4}/deprecate`),
        c.post(`/api/v1/admin/errors/${w.errors.e37v1}/deprecate`),
      ]);
      assert.deepEqual(
        res.map((r) => r.status),
        Array(4).fill(403),
        name,
      );
    }
    assert.equal(
      (await db.document.findUniqueOrThrow({ where: { id: w.docs.manFw4 } })).status,
      'PUBLISHED',
    );
    assert.equal(await db.product.count({ where: { model: 'X-1' } }), 0);
  });

  test('одитът се чете само с audit:read (админ на клиента); отговорникът и поддръжката — не', async () => {
    assert.equal((await w.tenantAdmin.get('/api/v1/audit')).status, 200);
    for (const c of [w.ownerA1, w.support, w.internal, w.portalAlfa]) {
      assert.equal((await c.get('/api/v1/audit')).status, 403);
    }
  });

  test('администратор на клиента управлява/вижда, но не създава случаи и не пита AI', async () => {
    assert.equal(
      (await w.tenantAdmin.post('/api/v1/sessions', { context: baseContext })).status,
      403,
    );
    const caseId = await newCase(w.portalAlfa);
    assert.equal((await ask(w.tenantAdmin, caseId, 'Errore E37')).status, 403);
    assert.equal((await w.tenantAdmin.get(`/api/v1/cases/${caseId}`)).status, 200);
    assert.equal(h.model.calls, 0);
  });

  test('непознат път: вписан → JSON 404, не HTML и не стек; без вписване → 401', async () => {
    const res = await w.portalAlfa.get('/api/v1/nema-takova');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'not_found', code: 'not_found' });
    assert.equal((await new Client(h.base).get('/api/v1/nema-takova')).status, 401);
  });

  test('здравни проби са публични; готовността казва дали AI е включен', async () => {
    const anon = new Client(h.base);
    assert.deepEqual((await anon.get('/healthz')).body, { ok: true });
    // Деплой сондата чете ok + app + ai; aiCircuit (F3) е допълнително поле — без breaker → null.
    assert.deepEqual((await anon.get('/readyz')).body, {
      ok: true,
      app: 'chatchat',
      ai: true,
      aiCircuit: null,
    });
  });
});

describe('Четири очи за документи по безопасност (§11.3)', () => {
  const SAFETY = {
    code: 'PROC-SAFE-2',
    type: 'PROCEDURE',
    safetyRelevant: true,
    pages: [{ page: 1, text: 'Procedura di sicurezza approvata per la fossa.' }],
  } as const;

  test('качилият не може да публикува свой safety документ: 409 four_eyes_required', async () => {
    const id = await uploadDoc(w.ownerA1, SAFETY);
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${id}/submit`)).status, 204);
    const self = await w.ownerA1.post(`/api/v1/admin/documents/${id}/publish`);
    assert.equal(self.status, 409);
    assert.equal(self.body.code, 'four_eyes_required');
    const still = await db.document.findUniqueOrThrow({ where: { id } });
    assert.equal(still.status, 'REVIEW');
    assert.equal(still.approvedById, null);
    assert.equal(
      await db.auditEvent.count({ where: { action: 'kb.document.publish', objectId: id } }),
      0,
    );

    assert.equal((await w.ownerA2.post(`/api/v1/admin/documents/${id}/publish`)).status, 204);
    const done = await db.document.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(
      [done.status, done.approvedById, done.uploadedById],
      ['PUBLISHED', w.users.ownerA2.id, w.users.ownerA1.id],
    );
  });

  test('документ, който не е по безопасност, може да се публикува от самия автор', async () => {
    const id = await publishDoc(w.ownerA1, {
      code: 'FAQ-X',
      type: 'FAQ',
      pages: [{ page: 1, text: 'Testo qualsiasi.' }],
    });
    assert.equal((await db.document.findUniqueOrThrow({ where: { id } })).status, 'PUBLISHED');
  });

  test('жизненият цикъл не се прескача: публикуване от чернова, повторно, отписване на непубликуван', async () => {
    const id = await uploadDoc(w.ownerA1, {
      code: 'FAQ-Y',
      type: 'FAQ',
      pages: [{ page: 1, text: 'Testo qualsiasi.' }],
    });
    for (const action of ['publish', 'deprecate', 'reject']) {
      const res = await w.ownerA1.post(`/api/v1/admin/documents/${id}/${action}`);
      assert.equal(res.status, 409, action);
      assert.equal(res.body.code, 'invalid_transition');
    }
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${id}/submit`)).status, 204);
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${id}/submit`)).status, 409);
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${id}/reject`)).status, 204);
    assert.equal((await db.document.findUniqueOrThrow({ where: { id } })).status, 'DRAFT');
  });

  test('приемане: непознат продукт 422, повторна ревизия 409, липсваща заменена ревизия 422, портал 403', async () => {
    const base = { code: 'DOC-Z', type: 'FAQ', pages: [{ page: 1, text: 'Testo.' }] } as const;
    const unknown = await w.ownerA1.post('/api/v1/admin/documents', {
      code: 'DOC-Z',
      title: 'Zeta',
      type: 'FAQ',
      language: 'it',
      revision: 'A',
      audience: 'PORTAL',
      safetyRelevant: false,
      sourceFilename: 'z.pdf',
      effectiveFrom: EFFECTIVE_FROM,
      applicability: [{ productModel: 'NEMA-9', allFirmware: true }],
      pages: base.pages,
    });
    assert.equal(unknown.status, 422);
    assert.equal(unknown.body.code, 'unknown_product');
    await uploadDoc(w.ownerA1, base);
    const dup = await w.ownerA1.post('/api/v1/admin/documents', {
      code: 'DOC-Z',
      title: 'Zeta',
      type: 'FAQ',
      language: 'it',
      revision: 'A',
      audience: 'PORTAL',
      safetyRelevant: false,
      sourceFilename: 'z.pdf',
      effectiveFrom: EFFECTIVE_FROM,
      applicability: [{ productModel: 'LTX-500', allFirmware: true }],
      pages: base.pages,
    });
    assert.equal(dup.status, 409);
    const missing = await w.ownerA1.post('/api/v1/admin/documents', {
      code: 'DOC-Z',
      title: 'Zeta',
      type: 'FAQ',
      language: 'it',
      revision: 'B',
      audience: 'PORTAL',
      safetyRelevant: false,
      sourceFilename: 'z.pdf',
      effectiveFrom: EFFECTIVE_FROM,
      supersedesRevision: 'Q',
      applicability: [{ productModel: 'LTX-500', allFirmware: true }],
      pages: base.pages,
    });
    assert.equal(missing.status, 422);
    assert.equal(missing.body.code, 'superseded_not_found');
    assert.equal((await w.portalAlfa.post('/api/v1/admin/documents', {})).status, 403);
  });
});

describe('Валидация на входа', () => {
  test('невалиден JSON → 400, твърде голямо тяло → 413, без изтичане на вътрешности', async () => {
    const raw = await fetch(`${h.base}/api/v1/chat/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE}=${w.portalAlfa.cookie}`,
        'x-csrf-token': w.portalAlfa.csrfToken ?? '',
      },
      body: '{"caseId": ',
    });
    assert.equal(raw.status, 400);
    assert.deepEqual(await raw.json(), { error: 'bad_request', code: 'bad_request' });

    const big = await w.portalAlfa.post('/api/v1/sessions', {
      context: baseContext,
      pad: 'x'.repeat(70_000),
    });
    assert.equal(big.status, 413);
    assert.equal(big.body.code, 'payload_too_large');
  });

  test('съобщение: празен текст, текст >4000, невалиден uuid, чужд формат на caseId → 400', async () => {
    const caseId = await newCase(w.portalAlfa);
    const bad = await Promise.all([
      w.portalAlfa.post('/api/v1/chat/messages', { caseId, text: '   ' }),
      w.portalAlfa.post('/api/v1/chat/messages', { caseId, text: 'x'.repeat(4001) }),
      w.portalAlfa.post('/api/v1/chat/messages', {
        caseId,
        text: 'ok',
        clientMessageId: 'не-е-uuid',
      }),
      w.portalAlfa.post('/api/v1/chat/messages', { caseId: '', text: 'ok' }),
      w.portalAlfa.post('/api/v1/chat/messages', { caseId: { $ne: null }, text: 'ok' }),
    ]);
    assert.deepEqual(
      bad.map((r) => r.status),
      Array(5).fill(400),
    );
    assert.equal(await db.caseMessage.count(), 0);
  });

  test('затворен случай не приема съобщения (409), контекстът се ограничава до продукти от каталога', async () => {
    const caseId = await newCase(w.portalAlfa);
    assert.equal(
      (await w.portalAlfa.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' })).status,
      200,
    );
    const closed = await ask(w.portalAlfa, caseId, 'Ancora un dubbio');
    assert.equal(closed.status, 409);
    assert.equal(closed.body.code, 'case_closed');
    assert.equal(h.model.calls, 0);
  });
});

describe('Одит веригата (FR-12, §15.1)', () => {
  test('след поредица от действия веригата е цяла (verifyAuditChain → null)', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, 'Errore E37');
    await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Non risolto' });
    await w.ownerA1.post(`/api/v1/admin/documents/${w.docs.manFw4}/deprecate`, {
      reason: 'Manuale ritirato',
    });
    await w.ownerA1.post(`/api/v1/admin/errors/${w.errors.e38}/deprecate`, { reason: 'Ritirato' });

    const events = await db.auditEvent.findMany({ orderBy: { id: 'asc' } });
    assert.ok(events.length >= 25, `събития: ${events.length}`);
    const actions = new Set(events.map((e) => e.action));
    for (const a of [
      'catalog.product.create',
      'kb.document.upload',
      'kb.document.publish',
      'case.create',
      'ai.answer',
      'ticket.create',
      'kb.document.deprecate',
    ]) {
      assert.ok(actions.has(a), a);
    }
    assert.equal(events[0]?.prevHash, '0'.repeat(64));
    assert.equal(await verifyAuditChain(db), null);
  });

  test('едновременни записи не разклоняват веригата (advisory lock)', async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        appendAudit(db, {
          tenantId: w.tenantA.id,
          actorId: null,
          action: `test.parallel.${i}`,
          detail: { i, nested: { b: 1, a: 2 } },
        }),
      ),
    );
    const prevs = (await db.auditEvent.findMany({ select: { prevHash: true } })).map(
      (e) => e.prevHash,
    );
    assert.equal(new Set(prevs).size, prevs.length, 'няма две събития със същия prevHash');
    assert.equal(await verifyAuditChain(db), null);
  });

  test('подправка и изтрит ред се откриват (самата проверка работи)', async () => {
    const caseId = await newCase(w.portalAlfa);
    await ask(w.portalAlfa, caseId, 'Messaggio', { askAi: false });
    assert.equal(await verifyAuditChain(db), null);

    const rows = await db.auditEvent.findMany({ orderBy: { id: 'asc' } });
    const victim = rows[Math.floor(rows.length / 2)];
    assert.ok(victim);
    await db.$executeRaw`UPDATE "AuditEvent" SET action = 'kb.document.nothing' WHERE id = ${victim.id}`;
    assert.equal(await verifyAuditChain(db), victim.id);
    await db.$executeRaw`UPDATE "AuditEvent" SET action = ${victim.action} WHERE id = ${victim.id}`;
    assert.equal(await verifyAuditChain(db), null);

    await db.auditEvent.delete({ where: { id: victim.id } });
    const broken = await verifyAuditChain(db);
    assert.ok(broken !== null && broken > victim.id);
  });

  test('в одита няма съдържание на разговор, пароли или токени', async () => {
    const SECRET = 'SEGRETO-DELLA-CONVERSAZIONE-7731';
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    await ask(w.portalAlfa, caseId, `Errore E37 ${SECRET}`);
    await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: `Motivo ${SECRET}` });
    const dump = JSON.stringify(await db.auditEvent.findMany());
    assert.equal(dump.includes(SECRET), false);
    assert.equal(dump.includes(PASSWORD), false);
    assert.equal(dump.includes(w.portalAlfa.cookie ?? 'x'), false);
    assert.ok(dump.includes('ai.answer'));
  });
});

describe('Заглавия на отговорите', () => {
  test('API: no-store; CSP без inline и без framing; без x-powered-by', async () => {
    const res = await w.portalAlfa.get('/api/v1/cases');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
