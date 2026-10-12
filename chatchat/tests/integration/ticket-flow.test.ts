import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { verifyAuditChain } from '../../src/audit.js';
import { db, resetDb, startApp, type Client, type Harness } from './helpers.js';
import { caseWithSteps, execute, extraStaff, type Extra } from './flow-world.js';
import { openStream } from './collab-world.js';
import { ask, newCase, seedWorld, type World } from './world.js';

/**
 * Работният поток на тикета (FR-09) и предаването AI → човек (FR-19, AC-14): предаване от
 * техника, опашка, поемане, „поискай още данни“, отговор, „върни към AI“, към Engineering,
 * прехвърляне, затваряне с резолюция и повторно отваряне — всяка промяна в хронологията, одита
 * и дневника на тикета, с известие до създателя; порталът вижда ролята, не името.
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

const handoff = (c: Client, caseId: string, message = 'Ho bisogno di un operatore, grazie') =>
  c.post(`/api/v1/cases/${caseId}/handoff`, { message });
const act = (c: Client, ticketId: string, action: string, body: unknown = {}) =>
  c.post(`/api/v1/tickets/${ticketId}/${action}`, body);
const unread = async (userId: string, eventType: string) =>
  db.notification.findMany({ where: { userId, eventType, readAt: null } });

describe('FR-19 — „Предай на оператор“', () => {
  test('създава тикет с резюме (контекст, източници, изпълнени стъпки, причина), спира AI за техника, известява опашката', async () => {
    const { caseId, messageId } = await caseWithSteps(h, w.portalAlfa);
    await execute(w.portalAlfa, caseId, { messageId, step: 1, result: 'KO' });
    const res = await handoff(w.portalAlfa, caseId, 'Il contatto resta aperto, tel 3331234567');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.case.aiPaused, true);
    assert.equal(res.body.case.status, 'WAITING_TECHNICIAN');
    assert.deepEqual([res.body.ticket.status, res.body.ticket.queue], ['OPEN', 'SUPPORT']);

    const stored = await db.caseHandoff.findFirstOrThrow({ where: { caseId } });
    assert.equal(stored.direction, 'TO_OPERATOR');
    assert.equal(stored.reason.includes('3331234567'), false, 'причината е маскирана');
    const summary = stored.summary as Record<string, unknown> & {
      context: { firmware: string; serial: string };
      sources: Array<{ documentCode: string }>;
      executedSteps: Array<{ step: number; result: string }>;
    };
    assert.equal(summary.context.firmware, '4.2');
    assert.equal(summary.context.serial, 'SN-ALFA-1');
    assert.ok(summary.sources.some((s) => s.documentCode === 'PROC-DOOR-001'));
    assert.deepEqual(
      summary.executedSteps.map((e) => [e.step, e.result]),
      [[1, 'KO']],
    );
    assert.ok(Array.isArray(summary.attachments));

    // Известие до поддръжката (опашката SUPPORT) — не до инженеринга, портала или чуждия клиент.
    const notified = new Set(
      (await db.notification.findMany({ where: { eventType: 'handoff.requested' } })).map(
        (n) => n.userId,
      ),
    );
    assert.deepEqual(notified, new Set([w.users.support.id, x.support2.id]));

    // AI мълчи за техника: съобщението отива при оператора, моделът не се вика.
    h.model.reset();
    const quiet = await ask(w.portalAlfa, caseId, 'Ci siete?');
    assert.equal(quiet.status, 201);
    assert.deepEqual([quiet.body.answer, quiet.body.aiPaused], [null, true]);
    assert.equal(h.model.calls, 0);
    // Персоналът може да пита AI и тогава.
    h.model.plan = () => ({});
    assert.equal((await ask(w.support, caseId, 'Errore E37')).status, 201);
    assert.equal(h.model.calls, 1);

    const again = await handoff(w.portalAlfa, caseId);
    assert.deepEqual([again.status, again.body.code], [409, 'already_handed_off']);
    const types = (await db.caseTimelineEvent.findMany({ where: { caseId } })).map((e) => e.type);
    assert.ok(types.includes('ticket.created') && types.includes('handoff.to_operator'));
    assert.equal(await db.ticketEvent.count({ where: { caseId } }), 2);
  });

  test('само създателят предава; чужд случай → 404; затворен случай → 409', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    assert.equal((await handoff(w.portalBeta, caseId)).status, 404);
    assert.equal((await handoff(w.portalB, caseId)).status, 404);
    assert.equal((await handoff(w.support, caseId)).status, 403);
    assert.equal((await handoff(w.tenantAdmin, caseId)).status, 403, 'без ticket:create');
    await w.portalAlfa.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' });
    assert.equal((await handoff(w.portalAlfa, caseId)).status, 409);
  });
});

describe('FR-09 — опашка и пълният поток на тикета', () => {
  test('опашка → поемане → искане на данни → отговор → върни към AI → затваряне с резолюция → повторно отваряне', async () => {
    const { caseId } = await caseWithSteps(h, w.portalAlfa);
    const ticketId = (await handoff(w.portalAlfa, caseId)).body.ticket.id as string;

    // Опашката: само персоналът на клиента.
    const q = await w.support.get('/api/v1/tickets?view=unassigned');
    assert.equal(q.status, 200);
    assert.deepEqual(
      q.body.tickets.map((t: { id: string }) => t.id),
      [ticketId],
    );
    assert.equal(q.body.tickets[0].case.aiPaused, true);
    assert.equal(q.body.counts.unassigned, 1);
    assert.equal((await w.portalAlfa.get('/api/v1/tickets')).status, 403);
    assert.equal((await w.internal.get('/api/v1/tickets')).status, 403);
    assert.deepEqual((await x.supB.get('/api/v1/tickets?view=all')).body.tickets, []);
    assert.equal((await x.supB.get(`/api/v1/tickets/${ticketId}`)).status, 404);
    assert.equal((await w.portalBeta.get(`/api/v1/tickets/${ticketId}`)).status, 404);

    // Поемане: тикетът и случаят са на оператора; създателят научава РОЛЯТА, не името.
    assert.equal((await act(w.portalAlfa, ticketId, 'claim')).status, 403);
    const claimed = await act(w.support, ticketId, 'claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
    assert.deepEqual(
      [claimed.body.ticket.status, claimed.body.ticket.ownerId, claimed.body.case.status],
      ['IN_PROGRESS', w.users.support.id, 'IN_PROGRESS'],
    );
    const other = await act(x.sup2, ticketId, 'claim');
    assert.deepEqual([other.status, other.body.code], [409, 'ticket_owned']);
    const note = (await unread(w.users.portalAlfa.id, 'ticket.changed')).at(-1);
    assert.deepEqual((note?.payload as { assignedTo: unknown }).assignedTo, {
      id: w.users.support.id,
      name: null,
      role: 'SUPPORT',
    });
    assert.deepEqual(
      (await w.support.get('/api/v1/tickets?view=mine')).body.tickets.map(
        (t: { id: string }) => t.id,
      ),
      [ticketId],
    );

    // „Поискай още данни“: само отговорникът; техникът вижда списъка (маскиран).
    const items = ['Foto della targhetta', 'Registro eventi, contatto: a.b@example.com'];
    assert.equal((await act(x.sup2, ticketId, 'request-info', { items })).status, 403);
    assert.equal((await act(w.support, ticketId, 'request-info', { items: [] })).status, 400);
    const asked = await act(w.support, ticketId, 'request-info', { items, note: 'Grazie' });
    assert.deepEqual(
      [asked.body.ticket.status, asked.body.case.status],
      ['WAITING', 'WAITING_CUSTOMER'],
    );
    const tech = await w.portalAlfa.get(`/api/v1/cases/${caseId}`);
    const open = tech.body.ticket.openInfoRequest;
    assert.equal(open.items[0], 'Foto della targhetta');
    assert.equal(JSON.stringify(open).includes('a.b@example.com'), false);
    assert.deepEqual(open.requestedBy, { id: w.users.support.id, name: null, role: 'SUPPORT' });
    assert.equal((await unread(w.users.portalAlfa.id, 'ticket.info_requested')).length, 1);

    // Отговорът на техника връща случая в работа; отговорникът научава.
    const reply = await ask(w.portalAlfa, caseId, 'Ecco la foto e il registro');
    assert.equal(reply.status, 201);
    const back = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    assert.equal(back.status, 'IN_PROGRESS');
    assert.equal(
      (await db.case.findUniqueOrThrow({ where: { id: caseId } })).status,
      'IN_PROGRESS',
    );
    assert.equal((await unread(w.users.support.id, 'ticket.info_provided')).length, 1);
    const answered = await db.ticketInfoRequest.findFirstOrThrow({ where: { ticketId } });
    assert.ok(answered.answeredAt && answered.answeredMessageId === reply.body.message.id);

    // „Върни към AI“: само отговорникът; AI отговаря отново на техника.
    assert.equal((await act(x.sup2, ticketId, 'return-to-ai')).status, 403);
    const resumed = await act(w.support, ticketId, 'return-to-ai', { note: 'Chieda pure all’AI' });
    assert.equal(resumed.body.case.aiPaused, false);
    assert.equal((await unread(w.users.portalAlfa.id, 'handoff.to_ai')).length, 1);
    h.model.reset();
    h.model.plan = () => ({});
    const ai = await ask(w.portalAlfa, caseId, 'Errore E37');
    assert.equal(ai.status, 201);
    assert.equal(h.model.calls, 1);
    assert.equal(
      (await db.case.findUniqueOrThrow({ where: { id: caseId } })).status,
      'IN_PROGRESS',
    );
    assert.equal((await act(w.support, ticketId, 'return-to-ai')).body.code, 'ai_not_paused');

    // Затваряне с резолюция: първопричина, решение, свързани източници (документ на клиента).
    const foreign = await act(w.support, ticketId, 'close', {
      rootCause: 'Contatto ossidato',
      solution: 'Sostituito il contatto',
      sourceDocumentIds: [w.docs.tenantB],
    });
    assert.deepEqual([foreign.status, foreign.body.code], [422, 'unknown_source']);
    assert.equal(
      (await act(x.sup2, ticketId, 'close', { rootCause: 'abc', solution: 'abc' })).status,
      403,
    );
    const closed = await act(w.support, ticketId, 'close', {
      rootCause: 'Contatto porta ossidato',
      solution: 'Sostituito il contatto e verificato con multimetro',
      sourceDocumentIds: [w.docs.procedure],
    });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    assert.deepEqual(
      [closed.body.ticket.status, closed.body.case.status, closed.body.case.outcome],
      ['CLOSED', 'RESOLVED', 'RESOLVED'],
    );
    const seen = await w.portalAlfa.get(`/api/v1/cases/${caseId}`);
    assert.equal(seen.body.ticket.resolution.rootCause, 'Contatto porta ossidato');
    assert.equal(seen.body.ticket.resolution.sources[0].documentCode, 'PROC-DOOR-001');
    assert.equal((await act(w.support, ticketId, 'claim')).status, 409);

    // Повторно отваряне от техника: тикетът е пак на оператора; случаят — в работа.
    assert.equal((await act(w.portalBeta, ticketId, 'reopen', { reason: 'Intruso' })).status, 404);
    const reopened = await act(w.portalAlfa, ticketId, 'reopen', { reason: 'Il guasto è tornato' });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.deepEqual(
      [reopened.body.ticket.status, reopened.body.case.status, reopened.body.case.outcome],
      ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'],
    );
    assert.equal((await act(w.portalAlfa, ticketId, 'reopen', { reason: 'Di nuovo' })).status, 409);

    // Всяка промяна: дневник на тикета + хронология + одит; веригата е цяла.
    const events = (
      await db.ticketEvent.findMany({ where: { ticketId }, orderBy: { at: 'asc' } })
    ).map((e) => e.type);
    assert.deepEqual(events, [
      'ticket.created',
      'handoff.to_operator',
      'ticket.claimed',
      'ticket.info_requested',
      'ticket.info_provided',
      'handoff.to_ai',
      'ticket.closed',
      'ticket.reopened',
    ]);
    const tl = (await w.portalAlfa.get(`/api/v1/cases/${caseId}/timeline`)).body.events.map(
      (e: { type: string }) => e.type,
    );
    for (const e of events) assert.ok(tl.includes(e), e);
    const actions = new Set((await db.auditEvent.findMany()).map((a) => a.action));
    for (const a of ['ticket.claim', 'ticket.info.request', 'ticket.close', 'ticket.reopen']) {
      assert.ok(actions.has(a), a);
    }
    assert.equal(await verifyAuditChain(db), null);

    const detail = await w.support.get(`/api/v1/tickets/${ticketId}`);
    assert.equal(detail.body.ticket.events.length, events.length);
    assert.equal(detail.body.ticket.summary.caseNumber, closed.body.case.number);
  });

  test('към Engineering: в опашката на инженеринга, без отговорник; причината е вътрешна', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const ticketId = (await handoff(w.portalAlfa, caseId)).body.ticket.id as string;
    await act(w.support, ticketId, 'claim');
    assert.equal((await act(w.support, ticketId, 'escalate', {})).status, 400);
    assert.equal((await act(x.sup2, ticketId, 'escalate', { reason: 'Non mio' })).status, 403);
    const up = await act(w.support, ticketId, 'escalate', {
      reason: 'Sospetto difetto firmware 4.2',
    });
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.deepEqual(
      [up.body.ticket.queue, up.body.ticket.ownerId, up.body.ticket.status, up.body.case.status],
      ['ENGINEERING', null, 'OPEN', 'WAITING_TECHNICIAN'],
    );
    assert.equal((await unread(x.engineering.id, 'ticket.escalated')).length, 1);
    assert.equal((await act(w.support, ticketId, 'escalate', { reason: 'Ancora' })).status, 409);
    const portal = await w.portalAlfa.get(`/api/v1/tickets/${ticketId}`);
    const toEng = portal.body.ticket.handoffs.find(
      (x2: { direction: string }) => x2.direction === 'TO_ENGINEERING',
    );
    assert.equal(toEng.reason, null, 'порталът не вижда вътрешната причина');
    assert.equal(JSON.stringify(portal.body).includes('Sospetto difetto'), false);
    const staff = await x.eng.get(`/api/v1/tickets/${ticketId}`);
    assert.equal(
      staff.body.ticket.handoffs.find(
        (x2: { direction: string }) => x2.direction === 'TO_ENGINEERING',
      ).reason,
      'Sospetto difetto firmware 4.2',
    );
    const engQueue = await x.eng.get('/api/v1/tickets?view=unassigned&queue=ENGINEERING');
    assert.deepEqual(
      engQueue.body.tickets.map((t: { id: string }) => t.id),
      [ticketId],
    );
    assert.equal((await act(x.eng, ticketId, 'claim')).body.ticket.ownerId, x.engineering.id);
  });

  test('назначаване/прехвърляне: на колега с case:assign; чужд тикет — само с причина; невалиден получател → 422', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const ticketId = (await handoff(w.portalAlfa, caseId)).body.ticket.id as string;
    const toSup2 = await act(w.support, ticketId, 'assign', { userId: x.support2.id });
    assert.deepEqual(
      [toSup2.body.ticket.status, toSup2.body.ticket.ownerId],
      ['ASSIGNED', x.support2.id],
    );
    assert.equal((await unread(x.support2.id, 'ticket.assigned')).length, 1);
    const noReason = await act(w.support, ticketId, 'assign', { userId: x.engineering.id });
    assert.deepEqual([noReason.status, noReason.body.code], [422, 'reason_required']);
    const withReason = await act(w.support, ticketId, 'assign', {
      userId: x.engineering.id,
      reason: 'Sara Due è in ferie',
    });
    assert.equal(withReason.body.ticket.ownerId, x.engineering.id);
    assert.equal((await unread(x.support2.id, 'ticket.changed')).length, 1, 'предишният научава');
    for (const userId of [w.users.portalAlfa.id, w.users.tenantAdmin.id, x.supportB.id, 'nope']) {
      const bad = await act(w.support, ticketId, 'assign', { userId, reason: 'prova' });
      assert.deepEqual([bad.status, bad.body.code], [422, 'invalid_assignee'], userId);
    }
    const people = await w.support.get('/api/v1/tickets/assignees?q=Sara');
    assert.deepEqual(
      people.body.people.map((p: { id: string }) => p.id).sort(),
      [x.support2.id].sort(),
    );
    assert.equal((await w.portalAlfa.get('/api/v1/tickets/assignees')).status, 403);
  });

  test('изход „решен“ затваря отворения тикет; тикет на поет случай е на поелия', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    assert.equal((await w.support.post(`/api/v1/cases/${caseId}/assign`)).status, 200);
    const t = await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Serve il supporto' });
    assert.deepEqual([t.body.ticket.status], ['IN_PROGRESS']);
    const stored = await db.ticket.findUniqueOrThrow({ where: { caseId } });
    assert.equal(stored.ownerId, w.users.support.id);
    await w.portalAlfa.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' });
    const after = await db.ticket.findUniqueOrThrow({ where: { caseId } });
    assert.equal(after.status, 'CLOSED');
    assert.equal((after.resolution as { via: string }).via, 'case.outcome');
  });

  test('поемане на случая (assign) с отворен тикет: поема и тикета; чужд тикет → 409', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const ticketId = (await handoff(w.portalAlfa, caseId)).body.ticket.id as string;
    assert.equal((await w.support.post(`/api/v1/cases/${caseId}/assign`)).status, 200);
    const t = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    assert.deepEqual([t.ownerId, t.status], [w.users.support.id, 'IN_PROGRESS']);
    const steal = await x.sup2.post(`/api/v1/cases/${caseId}/assign`);
    assert.deepEqual([steal.status, steal.body.code], [409, 'ticket_owned']);
  });

  test('реално време: техникът получава case.updated с ролята на оператора; queue.updated — само персоналът', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const ticketId = (await handoff(w.portalAlfa, caseId)).body.ticket.id as string;
    const portal = await openStream(w.portalAlfa);
    const beta = await openStream(w.portalBeta);
    const staff = await openStream(x.sup2);
    const foreign = await openStream(x.supB);
    try {
      await act(w.support, ticketId, 'claim');
      const ev = await portal.waitFor((e) => e.event === 'case.updated');
      assert.deepEqual(ev.data.data.ticket.owner, {
        id: w.users.support.id,
        name: null,
        role: 'SUPPORT',
      });
      const q = await staff.waitFor((e) => e.event === 'queue.updated');
      assert.deepEqual(Object.keys(q.data.data).sort(), ['caseId', 'queue', 'status', 'ticketId']);
      const own = await staff.waitFor((e) => e.event === 'case.updated');
      assert.equal(own.data.data.ticket.owner.name, 'Supporto');
      await portal.waitFor((e) => e.event === 'notification.created');
      assert.equal(
        portal.events.some((e) => e.event === 'queue.updated'),
        false,
      );
      assert.equal(
        beta.events.some((e) => ['case.updated', 'queue.updated'].includes(e.event)),
        false,
      );
      assert.equal(foreign.events.length, 0);
    } finally {
      for (const s of [portal, beta, staff, foreign]) s.close();
    }
  });
});
