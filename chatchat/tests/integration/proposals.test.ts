import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { cite, db, resetDb, startApp, type Client, type Harness, type Plan } from './helpers.js';
import { answerOf, ask, MODEL, newCase, publishDoc, seedWorld, type World } from './world.js';

/**
 * Обратната връзка към знанието (FR-10, §11.3) през истинския поток: коментар към „Non utile“ →
 * предложение в опашката на отговорника за знанието; решен случай → ЧЕРНОВА SOLVED_CASE;
 * конфликт между източници → автоматично, дедупликирано предложение. Опашката е само kb:manage:
 * порталът/поддръжката/администраторът на клиента — 403; чужд клиент — 404.
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

const queue = (c: Client, query = '') => c.get(`/api/v1/admin/proposals${query}`);

/** Случай на портала с един AI отговор; връща случая и id-то на отговора. */
async function answered(c: Client = w.portalAlfa) {
  const caseId = await newCase(c);
  const res = await ask(c, caseId, 'Il display mostra E37');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { caseId, messageId: res.body.answer.id as string };
}

describe('обратна връзка с коментар → предложение (FR-10)', () => {
  test('„Non utile“ + коментар: предложение NEW, маскиран коментар, известие към KO, одит без текст', async () => {
    const { caseId, messageId } = await answered();
    const fb = await w.portalAlfa.post('/api/v1/feedback', {
      messageId,
      rating: 'NOT_USEFUL',
      comment: 'Manca il passo per il morsetto X3, scrivetemi a mario.rossi@example.com',
    });
    assert.equal(fb.status, 204);
    const list = await queue(w.ownerA1);
    assert.equal(list.status, 200);
    assert.equal(list.body.proposals.length, 1);
    const p = list.body.proposals[0];
    assert.deepEqual([p.source, p.status, p.rating], ['FEEDBACK', 'NEW', 'NOT_USEFUL']);
    assert.match(p.comment, /\[email\]/);
    assert.doesNotMatch(p.comment, /mario\.rossi/);
    assert.equal(p.case.id, caseId);
    assert.equal(list.body.counts.NEW, 1);
    // Известие към двамата отговорници (без съдържание).
    const notes = await db.notification.findMany({ where: { eventType: 'proposal.created' } });
    assert.deepEqual(
      notes.map((n) => n.userId).sort(),
      [w.users.ownerA1.id, w.users.ownerA2.id].sort(),
    );
    assert.equal(JSON.stringify(notes.map((n) => n.payload)).includes('morsetto'), false);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'proposal.create' } });
    assert.equal(JSON.stringify(audit.detail).includes('morsetto'), false);
    assert.equal(audit.tenantId, w.tenantA.id);
  });

  test('нова оценка на същия човек обновява същото предложение; „Utile“/без коментар — без предложение', async () => {
    const { messageId } = await answered();
    const send = (rating: string, comment?: string) =>
      w.portalAlfa.post('/api/v1/feedback', { messageId, rating, ...(comment ? { comment } : {}) });
    assert.equal((await send('NOT_USEFUL')).status, 204);
    assert.equal((await queue(w.ownerA1)).body.proposals.length, 0, 'без коментар');
    assert.equal((await send('USEFUL', 'Ottimo')).status, 204);
    assert.equal((await queue(w.ownerA1)).body.proposals.length, 0, '„Utile“');
    assert.equal((await send('NOT_USEFUL', 'Primo commento')).status, 204);
    assert.equal((await send('TECHNICAL_ERROR', 'Il valore di coppia è sbagliato')).status, 204);
    const list = (await queue(w.ownerA1)).body.proposals;
    assert.equal(list.length, 1);
    assert.equal(list[0].rating, 'TECHNICAL_ERROR');
    assert.match(list[0].comment, /coppia/);
    assert.equal(await db.notification.count({ where: { userId: w.users.ownerA1.id } }), 1);
  });

  test('опашката е само за kb:manage: портал/поддръжка/админ — 403; чужд клиент — празно и 404', async () => {
    const { messageId } = await answered();
    await w.portalAlfa.post('/api/v1/feedback', {
      messageId,
      rating: 'NOT_USEFUL',
      comment: 'Non chiaro',
    });
    for (const c of [w.portalAlfa, w.support, w.tenantAdmin, w.internal]) {
      assert.equal((await queue(c)).status, 403);
    }
    const id = (await queue(w.ownerA1)).body.proposals[0].id as string;
    assert.equal((await w.portalAlfa.get(`/api/v1/admin/proposals/${id}`)).status, 403);
    assert.deepEqual((await queue(w.ownerB)).body.proposals, []);
    assert.equal((await w.ownerB.get(`/api/v1/admin/proposals/${id}`)).status, 404);
    assert.equal((await w.ownerB.post(`/api/v1/admin/proposals/${id}/review`)).status, 404);
    // Без CSRF токен — отказ (действие с последствие).
    const noCsrf = await w.ownerA1.post(`/api/v1/admin/proposals/${id}/review`, {}, { csrf: null });
    assert.equal(noCsrf.status, 403);
  });
});

describe('преходи NEW → IN_REVIEW → ACCEPTED/REJECTED', () => {
  async function newProposal(): Promise<string> {
    const { messageId } = await answered();
    await w.portalAlfa.post('/api/v1/feedback', {
      messageId,
      rating: 'TECHNICAL_ERROR',
      comment: 'Valore errato',
    });
    return (await queue(w.ownerA1)).body.proposals[0].id as string;
  }

  test('приемане иска преглед и връзка към документ/код на клиента', async () => {
    const id = await newProposal();
    const url = `/api/v1/admin/proposals/${id}`;
    assert.equal((await w.ownerA1.post(`${url}/accept`, {})).status, 409, 'първо преглед');
    const reviewed = await w.ownerA1.post(`${url}/review`);
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.proposal.status, 'IN_REVIEW');
    assert.equal(reviewed.body.proposal.reviewer.id, w.users.ownerA1.id);
    assert.equal((await w.ownerA2.post(`${url}/review`)).status, 409, 'вече е в преглед');
    assert.equal((await w.ownerA1.post(`${url}/accept`, {})).status, 422);
    const foreign = await w.ownerA1.post(`${url}/accept`, { documentId: w.docs.tenantB });
    assert.equal(foreign.status, 422);
    assert.equal(foreign.body.code, 'unknown_document');
    const accepted = await w.ownerA2.post(`${url}/accept`, {
      documentId: w.docs.manFw4,
      errorId: w.errors.e37v1,
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const p = accepted.body.proposal;
    assert.equal(p.status, 'ACCEPTED');
    assert.deepEqual([p.resultDocument.code, p.resultError.code], ['MAN-500', 'E37']);
    assert.equal(p.decidedBy.id, w.users.ownerA2.id);
    assert.equal((await w.ownerA1.post(`${url}/reject`, { reason: 'Troppo tardi' })).status, 409);
    const audit = await db.auditEvent.findMany({
      where: { objectId: id },
      orderBy: { id: 'asc' },
    });
    assert.deepEqual(
      audit.map((a) => a.action),
      ['proposal.create', 'proposal.review', 'proposal.accept'],
    );
  });

  test('отхвърляне с причина (маскирана); филтри и броячи', async () => {
    const id = await newProposal();
    const url = `/api/v1/admin/proposals/${id}`;
    await w.ownerA1.post(`${url}/review`);
    assert.equal(
      (await w.ownerA1.post(`${url}/reject`, {})).status,
      400,
      'причината е задължителна',
    );
    const rejected = await w.ownerA1.post(`${url}/reject`, {
      reason: 'Già documentato, chiamare 3331234567',
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.proposal.status, 'REJECTED');
    assert.match(rejected.body.proposal.rejectReason, /\[tel\]/);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'proposal.reject' } });
    assert.equal(JSON.stringify(audit.detail).includes('3331234567'), false);
    const list = await queue(w.ownerA1, '?status=REJECTED&source=FEEDBACK');
    assert.equal(list.body.proposals.length, 1);
    assert.deepEqual(list.body.counts, { NEW: 0, IN_REVIEW: 0, ACCEPTED: 0, REJECTED: 1 });
    assert.equal((await queue(w.ownerA1, '?status=NEW')).body.proposals.length, 0);
    assert.equal((await queue(w.ownerA1, '?status=BOH')).status, 400);
  });
});

describe('решен случай → ЧЕРНОВА SOLVED_CASE (§11.3)', () => {
  const STEP = 'Verificare il cavo encoder al morsetto X3';
  const withStep: Plan = (pack) => {
    const first = pack.find((p) => p.applicable);
    assert.ok(first);
    return {
      causes: [{ text: 'Cavo encoder scollegato', evidenceRefs: [first.ref] }],
      checks: [
        {
          step: 1,
          action: STEP,
          expected: 'Cavo collegato',
          actionClass: 'DIAGNOSTIC',
          evidenceRefs: [first.ref],
        },
      ],
      evidenceUsed: [cite(first)],
    };
  };

  async function solvedCase(): Promise<string> {
    h.model.plan = withStep;
    const caseId = await newCase(w.portalAlfa, { context: { serial: 'SN-ALFA-1' } });
    await w.portalAlfa.patch(`/api/v1/cases/${caseId}/context`, {
      context: {
        productModel: MODEL,
        hardwareRevision: 'B',
        firmware: '4.2',
        serial: 'SN-ALFA-1',
        errorCode: 'E37',
        phase: 'startup',
        symptoms: ['Si ferma in partenza, telefonare a 3331234567'],
        observations: [],
        options: {},
      },
    });
    const res = await ask(w.portalAlfa, caseId, 'Il display mostra E37');
    const messageId = res.body.answer.id as string;
    assert.equal(answerOf(res).checks.length, 1);
    const step = await w.portalAlfa.post(`/api/v1/cases/${caseId}/steps`, {
      messageId,
      step: 1,
      result: 'KO',
      note: 'Note private di Mario',
    });
    assert.equal(step.status, 201, JSON.stringify(step.body));
    return caseId;
  }

  const propose = (c: Client, caseId: string, extra: object = {}) =>
    c.post('/api/v1/proposals/solved-case', {
      caseId,
      title: 'E37 con cavo encoder scollegato',
      rootCause: 'Connettore X3 ossidato',
      solution: 'Sostituito il connettore X3 e serrato il cavo encoder.',
      ...extra,
    });

  test('случаят трябва да е решен; черновата е DRAFT, анонимизирана, с изпълнените стъпки', async () => {
    const caseId = await solvedCase();
    assert.equal((await propose(w.support, caseId)).body.code, 'case_not_resolved');
    await w.portalAlfa.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' });
    const res = await propose(w.support, caseId, { note: 'Da verificare con Engineering' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { documentId, documentCode, audience, safetyRelevant } = res.body.proposal;
    assert.match(documentCode, /^SC-\d{4}-\d{6}$/);
    assert.deepEqual([audience, safetyRelevant], ['INTERNAL', false]);
    const doc = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { chunks: { orderBy: { ordinal: 'asc' } }, applicability: true },
    });
    assert.deepEqual(
      [doc.type, doc.status, doc.uploadedById],
      ['SOLVED_CASE', 'DRAFT', w.users.support.id],
    );
    const text = doc.chunks.map((c) => `${c.section} ${c.text}`).join('\n');
    assert.match(text, new RegExp(STEP));
    assert.match(text, /esito: KO/);
    assert.match(text, /Sostituito il connettore X3/);
    assert.match(text, /\[tel\]/);
    for (const forbidden of ['SN-ALFA-1', 'Mario', 'Tecnico Alfa', '3331234567']) {
      assert.equal(text.includes(forbidden), false, `„${forbidden}“ не бива да е в черновата`);
    }
    assert.deepEqual(
      doc.applicability.map((a) => [a.hwRevision, a.fwMin, a.fwMax, a.allFirmware, a.deviceId]),
      [['B', '4.2', '4.2', false, null]],
    );
    // В опашката на KO; второ предложение за същия случай — 409; порталът няма право.
    const list = (await queue(w.ownerA1, '?source=SOLVED_CASE')).body.proposals;
    assert.equal(list.length, 1);
    assert.equal(list[0].draftDocument.id, documentId);
    assert.equal(list[0].comment, 'Da verificare con Engineering');
    assert.equal((await propose(w.support, caseId)).body.code, 'proposal_exists');
    assert.equal((await propose(w.portalAlfa, caseId)).status, 403);
    assert.equal((await propose(w.internal, caseId)).status, 403);
    // AI не вижда черновата; нормалният жизнен цикъл я публикува (KO, не предложилият).
    const pid = list[0].id as string;
    await w.ownerA1.post(`/api/v1/admin/proposals/${pid}/review`);
    const accepted = await w.ownerA1.post(`/api/v1/admin/proposals/${pid}/accept`, {});
    assert.equal(
      accepted.body.proposal.resultDocument.id,
      documentId,
      'по подразбиране — черновата',
    );
    assert.equal(
      (await w.ownerA1.post(`/api/v1/admin/documents/${documentId}/submit`)).status,
      204,
    );
    assert.equal(
      (await w.ownerA2.post(`/api/v1/admin/documents/${documentId}/publish`)).status,
      204,
    );
  });

  test('аудиторията не е по-широка от цитираните източници; без решение — 422; чужд случай — 404', async () => {
    h.model.plan = withStep;
    const caseId = await newCase(w.internal);
    const res = await ask(w.internal, caseId, 'Bollettino ARCOBALENO per E37');
    assert.equal(res.status, 201);
    await w.internal.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' });
    assert.equal(
      (await propose(w.support, caseId, { solution: undefined, rootCause: undefined })).body.code,
      'solution_required',
    );
    const cited = answerOf(res).evidence.map((e: { documentCode: string }) => e.documentCode);
    const made = await propose(w.support, caseId, { audience: 'PORTAL' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(
      made.body.proposal.audience,
      cited.includes('INT-BULL-001') ? 'INTERNAL' : 'PORTAL',
    );
    assert.equal((await propose(w.ownerB, caseId)).status, 404);
  });
});

describe('конфликт между източници → предложение към KO (§11.3)', () => {
  test('автоматично, с дедупликация: второ попадение само увеличава брояча', async () => {
    for (const revision of ['A', 'B']) {
      await publishDoc(w.ownerA1, {
        code: 'MAN-CONF',
        revision,
        pages: [{ page: 2, text: `Revisione ${revision}: il relè K77 comanda il freno.` }],
      });
    }
    const caseId = await newCase(w.portalAlfa, { context: { errorCode: null } });
    const first = answerOf(await ask(w.portalAlfa, caseId, 'A cosa serve il relè K77?'));
    assert.equal(first.gate.evidenceLevel, 'conflict');
    let list = (await queue(w.ownerA1, '?source=CONFLICT')).body.proposals;
    assert.equal(list.length, 1);
    const p = list[0];
    assert.deepEqual(
      [p.conflict.kind, p.conflict.code, p.occurrences],
      ['revision', 'MAN-CONF', 1],
    );
    assert.deepEqual(
      p.conflict.items.map((i: { revision: string }) => i.revision),
      ['A', 'B'],
    );
    assert.equal(p.createdBy, null, 'системата, не човек');
    await ask(w.portalAlfa, caseId, 'A cosa serve il relè K77?');
    list = (await queue(w.ownerA1, '?source=CONFLICT')).body.proposals;
    assert.equal(list.length, 1);
    assert.equal(list[0].occurrences, 2);
    assert.equal(
      await db.notification.count({
        where: { userId: w.users.ownerA1.id, eventType: 'proposal.created' },
      }),
      1,
    );
    // Порталът не вижда опашката, нито предложението в случая си.
    const view = await w.portalAlfa.get(`/api/v1/cases/${caseId}`);
    assert.equal(JSON.stringify(view.body).includes(p.id), false);
  });

  test('конфликт само от модела (свободен текст) не прави предложение', async () => {
    h.model.plan = (pack) => {
      const items = pack.filter((x) => x.applicable).slice(0, 2);
      return items.length === 2
        ? { conflicts: [{ description: 'revision:FALSO', refs: items.map((i) => i.ref) }] }
        : {};
    };
    const caseId = await newCase(w.portalAlfa);
    await ask(w.portalAlfa, caseId, 'Il display mostra E37');
    assert.equal((await queue(w.ownerA1, '?source=CONFLICT')).body.proposals.length, 0);
  });
});
