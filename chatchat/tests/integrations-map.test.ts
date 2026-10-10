import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  failureOf,
  retryAfterMs,
  thrownToResult,
} from '../src/services/integrations/connectors/types.js';
import type { HttpResponse } from '../src/services/integrations/http.js';
import { deliveryBackoffMs } from '../src/services/integrations/outbox.js';
import { clip, type ExternalTicket } from '../src/services/integrations/payload.js';
import { NetFailure } from '../src/services/integrations/ssrf.js';
import {
  actionFromJira,
  actionFromZendesk,
  inboundTransition,
  zendeskStatusFor,
} from '../src/services/integrations/status-map.js';
import {
  commentOf,
  describe as describeTicket,
  subjectOf,
} from '../src/services/integrations/texts.js';
import { TICKET } from './integrations-fixtures.js';

/** Мапването на статусите, класификацията на грешките, отстъпът и минимизацията (GDPR). */

describe('мапване на статусите', () => {
  test('ChatChat → Zendesk', () => {
    assert.equal(zendeskStatusFor('OPEN', true), 'new');
    assert.equal(zendeskStatusFor('OPEN', false), 'open');
    assert.equal(zendeskStatusFor('ASSIGNED', false), 'open');
    assert.equal(zendeskStatusFor('IN_PROGRESS', false), 'open');
    assert.equal(zendeskStatusFor('WAITING', false), 'pending');
    assert.equal(zendeskStatusFor('CLOSED', false), 'solved');
  });

  test('Zendesk/Jira → действие', () => {
    assert.equal(actionFromZendesk('Solved'), 'close');
    assert.equal(actionFromZendesk('closed'), 'close');
    assert.equal(actionFromZendesk('open'), 'reopen');
    assert.equal(actionFromZendesk('pending'), null);
    assert.equal(actionFromZendesk('hold'), null);
    assert.equal(actionFromJira('done'), 'close');
    assert.equal(actionFromJira('indeterminate'), 'reopen');
    assert.equal(actionFromJira('weird'), null);
  });

  test('входящото минава през машината на преходите (не я заобикаля)', () => {
    assert.deepEqual(inboundTransition('close', 'IN_PROGRESS', true), {
      apply: true,
      to: 'CLOSED',
    });
    assert.deepEqual(inboundTransition('close', 'WAITING', true), { apply: true, to: 'CLOSED' });
    // Неподет тикет не се затваря отвън — машината не го позволява.
    assert.deepEqual(inboundTransition('close', 'OPEN', false), {
      apply: false,
      reason: 'invalid_transition',
    });
    assert.deepEqual(inboundTransition('close', 'CLOSED', true), {
      apply: false,
      reason: 'already_closed',
    });
    assert.deepEqual(inboundTransition('reopen', 'CLOSED', true), { apply: true, to: 'ASSIGNED' });
    assert.deepEqual(inboundTransition('reopen', 'CLOSED', false), { apply: true, to: 'OPEN' });
    assert.deepEqual(inboundTransition('reopen', 'IN_PROGRESS', true), {
      apply: false,
      reason: 'not_closed',
    });
  });
});

describe('класификация на грешките и отстъп', () => {
  const res = (status: number, retryAfter: string | null = null): HttpResponse => ({
    status,
    body: '',
    headers: { retryAfter, contentType: null },
  });

  test('5xx/429/408/409 — повтор (Retry-After се уважава); друго 4xx — окончателно', () => {
    assert.deepEqual(failureOf(res(503)), { ok: false, retry: true, code: 'http_503' });
    assert.deepEqual(failureOf(res(429, '30')), {
      ok: false,
      retry: true,
      code: 'http_429',
      retryAfterMs: 30_000,
    });
    assert.equal(failureOf(res(409)).retry, true);
    assert.equal(failureOf(res(401)).retry, false);
    assert.equal(failureOf(res(422)).retry, false);
    assert.equal(retryAfterMs('999999'), 3_600_000, 'таван от час');
  });

  test('мрежа/таймаут — повтор; SSRF/пренасочване — окончателно', () => {
    assert.equal(thrownToResult(new NetFailure('timeout')).retry, true);
    assert.equal(thrownToResult(new NetFailure('network')).retry, true);
    assert.equal(thrownToResult(new NetFailure('ssrf_blocked')).retry, false);
    assert.equal(thrownToResult(new NetFailure('redirect_refused')).retry, false);
  });

  test('експоненциален отстъп 1, 2, 4… мин. с ±10 %, най-много час', () => {
    assert.equal(deliveryBackoffMs(1, 0.5), 60_000);
    assert.equal(deliveryBackoffMs(3, 0.5), 240_000);
    assert.equal(deliveryBackoffMs(20, 0.5), 3_600_000);
    assert.ok(deliveryBackoffMs(2, 0) >= 108_000 && deliveryBackoffMs(2, 1) <= 132_000);
  });
});

describe('минимизация (GDPR)', () => {
  test('свободният текст се маскира наново и се отрязва', () => {
    assert.equal(clip('scrivere a mario.rossi@example.com o 333 1234567').includes('@'), false);
    assert.equal(clip('x'.repeat(5000)).length, 2000);
  });

  test('темата, описанието и коментарите — само от минимизирания тикет (без имейли/имена)', () => {
    const closed: ExternalTicket = {
      ...TICKET,
      ticket: { ...TICKET.ticket, status: 'CLOSED' },
      resolution: {
        rootCause: 'Contatto ossidato',
        solution: 'Pulito',
        via: 'ticket',
        sources: [{ documentCode: 'MAN-LTX', revision: 'C' }],
      },
    };
    const texts = [
      subjectOf(TICKET),
      describeTicket('it', TICKET, 'IN_PROGRESS'),
      describeTicket('en', TICKET, 'OPEN'),
      commentOf('bg', 'ticket.closed', closed, { to: 'CLOSED', assigneeRole: null }),
      commentOf('it', 'ticket.assigned', TICKET, { to: 'ASSIGNED', assigneeRole: 'ENGINEERING' }),
    ].join('\n');
    assert.match(texts, /Allegati in ChatChat: 2/);
    assert.match(texts, /MAN-LTX rev C/);
    assert.match(texts, /Ruolo: ENGINEERING/);
    assert.doesNotMatch(texts, /@/);
  });
});
