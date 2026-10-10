import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { verifyAuditChain } from '../../src/audit.js';
import { sha256 } from '../../src/crypto.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import {
  caseWithSteps,
  decide,
  DIAG,
  execute,
  extraStaff,
  requestApproval,
  SAFETY,
  type Extra,
} from './flow-world.js';
import { ask, newCase, seedWorld, type World } from './world.js';

/**
 * Изпълнени стъпки и човешко потвърждение (§11.2 Human-in-the-loop, FR-09): техникът отбелязва
 * резултатите; стъпка по безопасност не се отбелязва като изпълнена без разрешение от ДРУГ човек
 * с роля по политиката; записано е КОЙ, кога, за коя стъпка (хеш + източници). Негативните
 * случаи на достъп: портал, чужд клиент, самият заявител, роля под нивото.
 */

let h: Harness;
let w: World;
let x: Extra;

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
  x = await extraStaff(h, w);
});

describe('изпълнени стъпки', () => {
  test('диагностична стъпка: резултат + бележка (маскирана), хеш и версия на Gate; хронологията — без бележката', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    const res = await execute(w.portalAlfa, caseId, {
      messageId,
      step: 1,
      result: 'OK',
      note: 'Fatto, chiamare mario.rossi@example.com',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const row = await db.caseStepExecution.findUniqueOrThrow({
      where: { id: res.body.execution.id },
    });
    assert.equal(row.note?.includes('mario.rossi@example.com'), false);
    assert.equal(row.stepHash, sha256(`${DIAG}\nIl codice è leggibile`));
    assert.equal(row.actionClass, 'DIAGNOSTIC');
    assert.match(row.gateVersion, /^gate-/);
    assert.equal(row.approvalId, null);

    const tl = await w.portalAlfa.get(`/api/v1/cases/${caseId}/timeline`);
    const ev = tl.body.events.find((e: { type: string }) => e.type === 'step.executed');
    assert.equal(ev.payload.result, 'OK');
    assert.equal(ev.payload.withNote, true);
    assert.equal(JSON.stringify(tl.body).includes('Fatto'), false, 'бележката не е в хронологията');
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'step.execute' } });
    assert.equal(JSON.stringify(audit.detail).includes('Fatto'), false, 'бележката не е в одита');

    const view = await w.portalAlfa.get(`/api/v1/cases/${caseId}`);
    assert.equal(view.body.steps.executions.length, 1);
    assert.equal(view.body.steps.executions[0].result, 'OK');
    assert.deepEqual(view.body.stepPolicy, { safetyRelevant: 'SUPPORT', configurative: 'NONE' });
  });

  test('стъпка по безопасност без разрешение → 409; „невъзможна“ не е изпълнение и минава', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    const denied = await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'OK' });
    assert.deepEqual([denied.status, denied.body.code], [409, 'step_approval_required']);
    const ko = await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'KO' });
    assert.deepEqual([ko.status, ko.body.code], [409, 'step_approval_required']);
    const np = await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'NOT_POSSIBLE' });
    assert.equal(np.status, 201);
    assert.equal(await db.caseStepExecution.count({ where: { result: { in: ['OK', 'KO'] } } }), 0);
  });

  test('достъп: чужда фирма/клиент → 404; персонал, който не е участник → 403; несъществуваща стъпка → 404', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    const body = { messageId, step: 1, result: 'OK' };
    assert.equal((await execute(w.portalBeta, caseId, body)).status, 404);
    assert.equal((await execute(w.portalB, caseId, body)).status, 404);
    assert.equal((await execute(x.supB, caseId, body)).status, 404);
    assert.equal((await execute(w.support, caseId, body)).status, 403);
    assert.equal((await execute(w.tenantAdmin, caseId, body)).status, 403);
    assert.equal((await execute(w.portalAlfa, caseId, { ...body, step: 9 })).status, 404);
    assert.equal((await execute(w.portalAlfa, caseId, { ...body, messageId: 'nope' })).status, 404);
  });

  test('затворен случай → 409; таван на отбелязванията на стъпка', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    for (let i = 0; i < 10; i += 1) {
      assert.equal(
        (await execute(w.portalAlfa, caseId, { messageId, step: 1, result: 'KO' })).status,
        201,
      );
    }
    const over = await execute(w.portalAlfa, caseId, { messageId, step: 1, result: 'OK' });
    assert.deepEqual([over.status, over.body.code], [409, 'step_limit']);
    await w.portalAlfa.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' });
    const closed = await execute(w.portalAlfa, caseId, { messageId, step: 1, result: 'OK' });
    assert.deepEqual([closed.status, closed.body.code], [409, 'case_closed']);
  });

  test('DIRECT_COMMAND (дори да е в записан отговор) — никога: нито изпълнение, нито разрешение', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const forged = await db.caseMessage.create({
      data: {
        caseId,
        kind: 'AI',
        body: 'x',
        audiences: ['PORTAL'],
        payload: {
          promptVersion: 'p+gate-x',
          evidence: [],
          checks: [
            {
              step: 1,
              action: 'Comandare la cabina al piano 3',
              expected: 'Cabina al piano',
              actionClass: 'DIRECT_COMMAND',
              evidenceRefs: [],
              requiresConfirmation: true,
            },
          ],
        },
      },
    });
    const ref = { messageId: forged.id, step: 1 };
    const e = await execute(w.portalAlfa, caseId, { ...ref, result: 'OK' });
    assert.deepEqual([e.status, e.body.code], [422, 'step_not_executable']);
    const a = await requestApproval(w.portalAlfa, caseId, { ...ref, attest: true });
    assert.deepEqual([a.status, a.body.code], [422, 'step_not_executable']);
  });

  test('AC-18: стъпка от отговор с аудитория, която читателят няма → 404', async () => {
    const caseId = await newCase(w.internal, { deviceSerial: 'SN-INT-1' });
    const eng = await db.caseMessage.create({
      data: {
        caseId,
        kind: 'AI',
        body: 'x',
        audiences: ['PORTAL', 'INTERNAL', 'ENGINEERING'],
        payload: {
          promptVersion: 'p+gate-x',
          evidence: [],
          checks: [
            { step: 1, action: DIAG, expected: 'ok', actionClass: 'DIAGNOSTIC', evidenceRefs: [] },
          ],
        },
      },
    });
    const res = await execute(w.internal, caseId, { messageId: eng.id, step: 1, result: 'OK' });
    assert.equal(res.status, 404);
  });
});

describe('човешко потвърждение (§11.2)', () => {
  test('заявка → известие до разрешаващите (не до заявителя, портала, чуждия клиент) → SUPPORT разрешава → изпълнение', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    const req = await requestApproval(w.portalAlfa, caseId, {
      messageId,
      step: 2,
      note: 'Sono sul posto, impianto fermo',
    });
    assert.equal(req.status, 202, JSON.stringify(req.body));
    assert.deepEqual([req.body.approval.status, req.body.approval.level], ['PENDING', 'SUPPORT']);
    const approvalId = req.body.approval.id as string;
    // Повторът връща същата заявка.
    const again = await requestApproval(w.portalAlfa, caseId, { messageId, step: 2 });
    assert.equal(again.body.approval.id, approvalId);

    const notified = (
      await db.notification.findMany({ where: { eventType: 'step.approval_requested' } })
    ).map((n) => n.userId);
    assert.deepEqual(
      new Set(notified),
      new Set([w.users.support.id, x.support2.id, x.engineering.id]),
    );

    const pending = await w.support.get('/api/v1/approvals');
    assert.equal(pending.status, 200);
    assert.equal(pending.body.approvals[0].id, approvalId);
    assert.equal(pending.body.approvals[0].action, SAFETY);
    assert.equal(pending.body.approvals[0].requestedBy.name, 'Tecnico Alfa');
    assert.equal((await w.portalAlfa.get('/api/v1/approvals')).status, 403);
    assert.deepEqual((await x.supB.get('/api/v1/approvals')).body.approvals, []);

    const ok = await decide(w.support, approvalId, 'GRANT', 'Procedura verificata con il tecnico');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.approval.status, 'GRANTED');
    const stored = await db.stepApproval.findUniqueOrThrow({ where: { id: approvalId } });
    assert.equal(stored.decidedById, w.users.support.id);
    assert.equal(stored.decidedRole, 'SUPPORT');
    assert.equal(stored.stepHash, sha256(`${SAFETY}\nContatto chiuso`));
    assert.equal(stored.actionClass, 'SAFETY_RELEVANT');
    const sources = stored.sources as Array<{ documentCode: string }>;
    assert.deepEqual(
      sources.map((s) => s.documentCode),
      ['PROC-DOOR-001'],
    );
    assert.ok(stored.expiresAt && stored.expiresAt > new Date());

    const done = await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'OK' });
    assert.equal(done.status, 201, JSON.stringify(done.body));
    assert.equal(done.body.execution.approvalId, approvalId);

    // Порталът вижда РОЛЯТА на разрешилия, не името; персоналът — името.
    const portal = await w.portalAlfa.get(`/api/v1/cases/${caseId}`);
    const seen = portal.body.steps.approvals[0];
    assert.deepEqual(seen.decidedBy, { id: w.users.support.id, name: null, role: 'SUPPORT' });
    assert.equal(JSON.stringify(portal.body).includes('Supporto'), false);
    const staff = await w.support.get(`/api/v1/cases/${caseId}`);
    assert.equal(staff.body.steps.approvals[0].decidedBy.name, 'Supporto');

    const decided = await db.notification.findFirstOrThrow({
      where: { userId: w.users.portalAlfa.id, eventType: 'step.approval_granted' },
    });
    assert.deepEqual((decided.payload as { decidedBy: unknown }).decidedBy, {
      id: w.users.support.id,
      name: null,
      role: 'SUPPORT',
    });
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'step.approval.decide' },
    });
    const detail = audit.detail as Record<string, unknown>;
    assert.equal(detail.stepHash, stored.stepHash);
    assert.equal(detail.decision, 'GRANTED');
    assert.equal(await verifyAuditChain(db), null);
  });

  test('кой НЕ може да разреши: портал/вътрешен техник (403), чужд клиент (404), самият заявител, роля под нивото', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    const id = (await requestApproval(w.portalAlfa, caseId, { messageId, step: 2 })).body.approval
      .id as string;
    assert.equal((await decide(w.portalAlfa, id, 'GRANT', 'Me lo autorizzo')).status, 403);
    assert.equal((await decide(w.portalBeta, id, 'GRANT', 'Intruso')).status, 403);
    assert.equal((await decide(w.internal, id, 'GRANT', 'Interno')).status, 403);
    assert.equal((await decide(w.tenantAdmin, id, 'GRANT', 'Admin')).status, 403);
    assert.equal((await decide(w.ownerA1, id, 'GRANT', 'Owner')).status, 403);
    assert.equal((await decide(x.supB, id, 'GRANT', 'Altro cliente')).status, 404);
    assert.equal(
      (await decide(w.support, id, 'GRANT', 'no')).status,
      400,
      'причината е задължителна',
    );

    // Служител, който сам е техник по случая, не разрешава собствената си заявка.
    const own = await caseWithSteps(h, w.support);
    const mine = (
      await requestApproval(w.support, own.caseId, { messageId: own.messageId, step: 2 })
    ).body.approval.id as string;
    const self = await decide(w.support, mine, 'GRANT', 'Autorizzo me stesso');
    assert.deepEqual([self.status, self.body.code], [403, 'approver_is_requester']);
    assert.equal((await decide(x.sup2, mine, 'GRANT', 'Verificato da collega')).status, 200);

    // Политика ENGINEERING: поддръжката е под нивото.
    await w.tenantAdmin.req('PUT', '/api/v1/admin/step-policy', {
      safetyRelevant: 'ENGINEERING',
      configurative: 'NONE',
      ttlMinutes: 60,
      reason: 'Solo Engineering per la sicurezza',
    });
    const eng = await caseWithSteps(h, w.portalAlfa);
    const engId = (
      await requestApproval(w.portalAlfa, eng.caseId, { messageId: eng.messageId, step: 2 })
    ).body.approval.id as string;
    const low = await decide(w.support, engId, 'GRANT', 'Non basta');
    assert.deepEqual([low.status, low.body.code], [403, 'approver_role']);
    assert.equal((await decide(x.eng, engId, 'GRANT', 'Engineering ok')).status, 200);
    assert.equal(
      (await db.stepApproval.findUniqueOrThrow({ where: { id: engId } })).decidedRole,
      'ENGINEERING',
    );
  });

  test('отказ с причина: изпълнението остава забранено; нова заявка е възможна; второ решение → 409', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    const id = (await requestApproval(w.portalAlfa, caseId, { messageId, step: 2 })).body.approval
      .id as string;
    const no = await decide(w.support, id, 'DENY', 'Serve prima il blocco impianto');
    assert.equal(no.body.approval.status, 'DENIED');
    const twice = await decide(x.sup2, id, 'GRANT', 'Ripensamento');
    assert.deepEqual([twice.status, twice.body.code], [409, 'approval_not_pending']);
    const exec = await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'OK' });
    assert.equal(exec.status, 409);
    const view = await w.portalAlfa.get(`/api/v1/cases/${caseId}`);
    assert.equal(view.body.steps.approvals[0].decisionReason, 'Serve prima il blocco impianto');
    const retry = await requestApproval(w.portalAlfa, caseId, { messageId, step: 2 });
    assert.equal(retry.status, 202);
    assert.notEqual(retry.body.approval.id, id);
    // Отказ от собствената заявка — само заявителят.
    assert.equal(
      (await w.support.post(`/api/v1/approvals/${retry.body.approval.id}/cancel`)).status,
      403,
    );
    const cancel = await w.portalAlfa.post(`/api/v1/approvals/${retry.body.approval.id}/cancel`);
    assert.equal(cancel.body.approval.status, 'CANCELLED');
  });

  test('изтекло разрешение или друг човек → 409; стъпка без нужда от разрешение → 422', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    const id = (await requestApproval(w.portalAlfa, caseId, { messageId, step: 2 })).body.approval
      .id as string;
    await decide(w.support, id, 'GRANT', 'Ok per il tecnico');
    await db.stepApproval.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const late = await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'OK' });
    assert.deepEqual([late.status, late.body.code], [409, 'step_approval_required']);
    const notNeeded = await requestApproval(w.portalAlfa, caseId, { messageId, step: 1 });
    assert.deepEqual([notNeeded.status, notNeeded.body.code], [422, 'approval_not_required']);
  });

  test('затегната политика след разрешението: старото (по-слабо) не стига; новото — от Engineering', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    const id = (await requestApproval(w.portalAlfa, caseId, { messageId, step: 2 })).body.approval
      .id as string;
    await decide(w.support, id, 'GRANT', 'Ok dal supporto');
    await w.tenantAdmin.req('PUT', '/api/v1/admin/step-policy', {
      safetyRelevant: 'ENGINEERING',
      configurative: 'NONE',
      ttlMinutes: 480,
      reason: 'Stretta dopo un incidente',
    });
    const weak = await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'OK' });
    assert.deepEqual([weak.status, weak.body.code], [409, 'step_approval_required']);
    const again = await requestApproval(w.portalAlfa, caseId, { messageId, step: 2 });
    assert.equal(again.status, 202);
    assert.equal(again.body.approval.level, 'ENGINEERING');
    await decide(x.eng, again.body.approval.id, 'GRANT', 'Engineering conferma');
    assert.equal(
      (await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'OK' })).status,
      201,
    );
  });

  test('политика SELF: изрично потвърждение на техника; без него → 422', async () => {
    const put = await w.tenantAdmin.req('PUT', '/api/v1/admin/step-policy', {
      safetyRelevant: 'SELF',
      configurative: 'NONE',
      ttlMinutes: 120,
      reason: 'Tecnici certificati',
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    const bare = await requestApproval(w.portalAlfa, caseId, { messageId, step: 2 });
    assert.deepEqual([bare.status, bare.body.code], [422, 'attestation_required']);
    const self = await requestApproval(w.portalAlfa, caseId, { messageId, step: 2, attest: true });
    assert.equal(self.status, 201);
    assert.equal(self.body.approval.status, 'GRANTED');
    const row = await db.stepApproval.findUniqueOrThrow({ where: { id: self.body.approval.id } });
    assert.equal(row.selfAttested, true);
    assert.equal(row.decidedById, w.users.portalAlfa.id);
    assert.equal(
      (await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'OK' })).status,
      201,
    );
  });

  test('политиката: само администраторът на клиента; SAFETY без разрешение не се приема; одит', async () => {
    const body = {
      safetyRelevant: 'SUPPORT',
      configurative: 'SELF',
      ttlMinutes: 240,
      reason: 'Revisione',
    };
    assert.equal((await w.support.req('PUT', '/api/v1/admin/step-policy', body)).status, 403);
    assert.equal((await w.portalAlfa.req('PUT', '/api/v1/admin/step-policy', body)).status, 403);
    assert.equal((await w.ownerA1.get('/api/v1/admin/step-policy')).status, 403);
    const none = await w.tenantAdmin.req('PUT', '/api/v1/admin/step-policy', {
      ...body,
      safetyRelevant: 'NONE',
    });
    assert.equal(none.status, 400);
    const ok = await w.tenantAdmin.req('PUT', '/api/v1/admin/step-policy', body);
    assert.deepEqual(ok.body.policy, {
      safetyRelevant: 'SUPPORT',
      configurative: 'SELF',
      ttlMinutes: 240,
    });
    const read = await w.tenantAdmin.get('/api/v1/admin/step-policy');
    assert.equal(read.body.policy.configurative, 'SELF');
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'step.policy.update' } });
    assert.equal(audit.tenantId, w.tenantA.id);
    // Клиент B не е засегнат.
    assert.equal(await db.stepApprovalPolicy.count({ where: { tenantId: w.tenantB.id } }), 0);
  });
});

describe('обобщението на тикета носи изпълнените стъпки и разрешенията (FR-09)', () => {
  test('след стъпки и разрешение тикетът ги съдържа с резултатите; без имена', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    await execute(w.portalAlfa, caseId, {
      messageId,
      step: 1,
      result: 'KO',
      note: 'Display spento',
    });
    const id = (await requestApproval(w.portalAlfa, caseId, { messageId, step: 2 })).body.approval
      .id as string;
    await decide(w.support, id, 'GRANT', 'Procedura ok');
    await execute(w.portalAlfa, caseId, { messageId, step: 2, result: 'OK' });
    const t = await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Serve il supporto' });
    assert.equal(t.status, 201);
    const s = t.body.ticket.summary;
    assert.deepEqual(
      s.executedSteps.map((e: { step: number; result: string; action: string }) => [
        e.step,
        e.result,
        e.action,
      ]),
      [
        [1, 'KO', DIAG],
        [2, 'OK', SAFETY],
      ],
    );
    assert.equal(s.executedSteps[0].note, 'Display spento');
    assert.equal(s.executedSteps[1].approvalId, id);
    assert.equal(s.approvals[0].status, 'GRANTED');
    assert.equal(s.approvals[0].decidedRole, 'SUPPORT');
    assert.equal(JSON.stringify(s).includes('Supporto'), false, 'без имена на служители');
    assert.equal(s.lastAnswer.checks[1].requiresConfirmation, true);
    // Портален читател без аудиторията на отговора не вижда стъпките му в обобщението.
    await ask(w.portalAlfa, caseId, 'ok', { askAi: false });
  });
});
