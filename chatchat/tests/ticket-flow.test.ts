import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { TicketStatus } from '@prisma/client';
import { can } from '../src/auth/rbac.js';
import {
  approverRoles,
  DEFAULT_STEP_POLICY,
  levelsApprovableBy,
  levelsAtLeast,
  stepRequirement,
} from '../src/services/steps/policy.js';
import {
  gateVersionOf,
  parseStepPayload,
  sourcesOf,
  stepHash,
} from '../src/services/steps/locate.js';
import {
  caseStatusFor,
  isOpenTicket,
  nextTicketStatus,
  TICKET_TRANSITIONS,
} from '../src/services/tickets/flow.js';
import { TICKET_EVENT_TYPES } from '../src/services/tickets/events.js';

/** Машината на тикета, политиката за разрешенията и стъпките — без база (FR-09, FR-19, §11.2). */

const ALL: TicketStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'CLOSED'];

describe('машината на преходите на тикета', () => {
  test('затвореният тикет не се поема, не се назначава, не чака и не се затваря отново', () => {
    for (const action of ['claim', 'assign', 'request_info', 'escalate', 'close'] as const) {
      assert.equal(nextTicketStatus(action, 'CLOSED', true), null, action);
    }
  });

  test('повторно отваряне: без отговорник → OPEN; с отговорник → ASSIGNED; само от CLOSED', () => {
    assert.equal(nextTicketStatus('reopen', 'CLOSED', false), 'OPEN');
    assert.equal(nextTicketStatus('reopen', 'CLOSED', true), 'ASSIGNED');
    for (const s of ALL.filter((x) => x !== 'CLOSED')) {
      assert.equal(nextTicketStatus('reopen', s, true), null, s);
    }
  });

  test('поемане започва работа; назначаване на друг — „назначен“; чакащият остава да чака', () => {
    assert.equal(nextTicketStatus('claim', 'OPEN', true), 'IN_PROGRESS');
    assert.equal(nextTicketStatus('claim', 'ASSIGNED', true), 'IN_PROGRESS');
    assert.equal(nextTicketStatus('assign', 'IN_PROGRESS', true), 'ASSIGNED');
    assert.equal(nextTicketStatus('claim', 'WAITING', true), 'WAITING');
    assert.equal(nextTicketStatus('assign', 'WAITING', true), 'WAITING');
  });

  test('искане на данни само от работа; отговорът връща в работа', () => {
    assert.equal(nextTicketStatus('request_info', 'IN_PROGRESS', true), 'WAITING');
    assert.equal(nextTicketStatus('request_info', 'OPEN', false), null);
    assert.equal(nextTicketStatus('request_info', 'WAITING', true), null);
    assert.equal(nextTicketStatus('info_provided', 'WAITING', true), 'IN_PROGRESS');
    assert.equal(nextTicketStatus('info_provided', 'IN_PROGRESS', true), null);
  });

  test('към Engineering — обратно в опашката; „върни към AI“ не сменя статуса', () => {
    for (const s of ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'] as const) {
      assert.equal(nextTicketStatus('escalate', s, false), 'OPEN', s);
    }
    assert.equal(nextTicketStatus('return_to_ai', 'IN_PROGRESS', true), 'IN_PROGRESS');
    assert.equal(nextTicketStatus('return_to_ai', 'OPEN', false), null);
  });

  test('предаване от техника: отворен остава; затворен се отваря наново', () => {
    assert.equal(nextTicketStatus('handoff', 'IN_PROGRESS', true), 'IN_PROGRESS');
    assert.equal(nextTicketStatus('handoff', 'CLOSED', false), 'OPEN');
    assert.equal(nextTicketStatus('handoff', 'CLOSED', true), 'ASSIGNED');
  });

  test('случаят следва тикета; всяка цел на преход има статус на случая', () => {
    assert.equal(caseStatusFor('OPEN'), 'WAITING_TECHNICIAN');
    assert.equal(caseStatusFor('ASSIGNED'), 'IN_PROGRESS');
    assert.equal(caseStatusFor('IN_PROGRESS'), 'IN_PROGRESS');
    assert.equal(caseStatusFor('WAITING'), 'WAITING_CUSTOMER');
    assert.equal(caseStatusFor('CLOSED'), 'RESOLVED');
    for (const table of Object.values(TICKET_TRANSITIONS)) {
      for (const to of Object.values(table)) assert.ok(caseStatusFor(to));
    }
    assert.deepEqual(
      ALL.filter((s) => isOpenTicket(s)),
      ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'],
    );
  });

  test('типовете събития на тикета са уникални и с префикс ticket./handoff.', () => {
    assert.equal(new Set(TICKET_EVENT_TYPES).size, TICKET_EVENT_TYPES.length);
    for (const t of TICKET_EVENT_TYPES) assert.match(t, /^(ticket|handoff)\.[a-z_]+$/);
  });
});

describe('политиката за човешко потвърждение (§11.2)', () => {
  const check = (actionClass: string, requiresConfirmation = false) =>
    ({ actionClass, requiresConfirmation }) as Parameters<typeof stepRequirement>[0];

  test('по подразбиране: SAFETY_RELEVANT → поддръжката; CONFIGURATIVE и диагностика → без', () => {
    assert.deepEqual(stepRequirement(check('SAFETY_RELEVANT', true), DEFAULT_STEP_POLICY), {
      executable: true,
      level: 'SUPPORT',
    });
    assert.deepEqual(stepRequirement(check('CONFIGURATIVE'), DEFAULT_STEP_POLICY), {
      executable: true,
      level: 'NONE',
    });
    assert.deepEqual(stepRequirement(check('DIAGNOSTIC'), DEFAULT_STEP_POLICY), {
      executable: true,
      level: 'NONE',
    });
  });

  test('DIRECT_COMMAND — никога изпълнимо, каквато и да е политиката', () => {
    for (const safetyRelevant of ['SELF', 'SUPPORT', 'ENGINEERING'] as const) {
      const policy = { ...DEFAULT_STEP_POLICY, safetyRelevant, configurative: 'NONE' as const };
      assert.deepEqual(stepRequirement(check('DIRECT_COMMAND'), policy), { executable: false });
    }
  });

  test('requiresConfirmation от Gate вдига стъпката до нивото за безопасност', () => {
    const policy = { ...DEFAULT_STEP_POLICY, safetyRelevant: 'ENGINEERING' as const };
    assert.deepEqual(stepRequirement(check('DIAGNOSTIC', true), policy), {
      executable: true,
      level: 'ENGINEERING',
    });
  });

  test('разрешават само други хора от персонала; инженерингът стига и за нивото на поддръжката', () => {
    assert.deepEqual(approverRoles('SUPPORT'), ['SUPPORT', 'ENGINEERING']);
    assert.deepEqual(approverRoles('ENGINEERING'), ['ENGINEERING']);
    assert.deepEqual(approverRoles('SELF'), []);
    assert.deepEqual(approverRoles('NONE'), []);
    assert.deepEqual(levelsApprovableBy('ENGINEERING'), ['SUPPORT', 'ENGINEERING']);
    assert.deepEqual(levelsApprovableBy('SUPPORT'), ['SUPPORT']);
    assert.deepEqual(levelsApprovableBy('PORTAL_TECHNICIAN'), []);
    assert.deepEqual(levelsApprovableBy('KNOWLEDGE_OWNER'), []);
  });

  test('разрешение покрива изискваното ниво само ако е поне толкова силно (fail-closed)', () => {
    assert.deepEqual(levelsAtLeast('ENGINEERING'), ['ENGINEERING']);
    assert.deepEqual(levelsAtLeast('SUPPORT'), ['SUPPORT', 'ENGINEERING']);
    assert.deepEqual(levelsAtLeast('SELF'), ['SELF', 'SUPPORT', 'ENGINEERING']);
    assert.deepEqual(levelsAtLeast('NONE'), ['SELF', 'SUPPORT', 'ENGINEERING']);
  });

  test('матрицата: само поддръжка и инженеринг разрешават; администраторът управлява политиката', () => {
    assert.equal(can('SUPPORT', 'step:approve'), true);
    assert.equal(can('ENGINEERING', 'step:approve'), true);
    for (const r of ['PORTAL_TECHNICIAN', 'INTERNAL_TECHNICIAN', 'TENANT_ADMIN'] as const) {
      assert.equal(can(r, 'step:approve'), false, r);
    }
    assert.equal(can('TENANT_ADMIN', 'policy:manage'), true);
    assert.equal(can('SUPPORT', 'policy:manage'), false);
    assert.equal(can('PORTAL_TECHNICIAN', 'step:record'), true);
    assert.equal(can('TENANT_ADMIN', 'step:record'), false);
  });
});

describe('стъпката: хеш, версия на Gate, източници', () => {
  const payload = parseStepPayload({
    promptVersion: 'prompt-2026-10-09.1+gate-2026-10-09.5',
    checks: [
      {
        step: 1,
        action: 'Verificare il contatto porta',
        expected: 'Chiuso',
        actionClass: 'SAFETY_RELEVANT',
        evidenceRefs: ['E2'],
        requiresConfirmation: true,
      },
    ],
    evidence: [
      {
        ref: 'E1',
        documentId: 'd1',
        documentCode: 'MAN',
        revision: 'A',
        page: 4,
        chunkId: 'c1',
        errorId: null,
      },
      {
        ref: 'E2',
        documentId: 'd2',
        documentCode: 'PROC',
        revision: 'B',
        page: 2,
        chunkId: 'c2',
        errorId: null,
      },
    ],
  });

  test('хешът зависи от текста; версията на Gate е след „+“', () => {
    assert.ok(payload);
    const k = payload.checks[0];
    assert.ok(k);
    assert.equal(stepHash(k), stepHash({ action: k.action, expected: k.expected }));
    assert.notEqual(stepHash(k), stepHash({ action: k.action, expected: 'Aperto' }));
    assert.match(stepHash(k), /^[0-9a-f]{64}$/);
    assert.equal(gateVersionOf(payload.promptVersion), 'gate-2026-10-09.5');
    assert.equal(gateVersionOf('prompt-only'), 'unknown');
  });

  test('източниците са само цитираните от стъпката, без откъса', () => {
    assert.ok(payload);
    const k = payload.checks[0];
    assert.ok(k);
    assert.deepEqual(sourcesOf(payload, k), [
      {
        ref: 'E2',
        documentId: 'd2',
        documentCode: 'PROC',
        revision: 'B',
        page: 2,
        chunkId: 'c2',
        errorId: null,
      },
    ]);
  });

  test('повреден payload няма стъпки (изходът е недоверен)', () => {
    assert.equal(parseStepPayload(null), null);
    assert.equal(parseStepPayload({ checks: [{ step: 'x' }] }), null);
  });
});
