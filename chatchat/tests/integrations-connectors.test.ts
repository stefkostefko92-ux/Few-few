import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { jsmConnector } from '../src/services/integrations/connectors/jsm.js';
import { webhookConnector } from '../src/services/integrations/connectors/webhook.js';
import { zendeskConnector } from '../src/services/integrations/connectors/zendesk.js';
import type { ExternalTicket } from '../src/services/integrations/payload.js';
import type {
  JsmConfig,
  WebhookConfig,
  ZendeskConfig,
} from '../src/services/integrations/settings.js';
import { CC_TIMESTAMP, verifyChatChat } from '../src/services/integrations/signature.js';
import { ctx, EVENT, fakeHttp } from './integrations-fixtures.js';

/** Форматите към Zendesk, JSM и общия webhook — срещу фалшив HTTP клиент (по документацията). */

describe('Zendesk', () => {
  const settings: ZendeskConfig = { subdomain: 'acme', authMode: 'oauth', language: 'it' };
  const origin = () => 'https://zd.test';

  test('нов тикет: търсене по external_id → POST с Idempotency-Key, вътрешен коментар, без хора', async () => {
    const { http, calls } = fakeHttp((req) =>
      req.method === 'GET'
        ? { status: 200, body: JSON.stringify({ tickets: [] }) }
        : { status: 201, body: JSON.stringify({ ticket: { id: 35436 } }) },
    );
    const r = await zendeskConnector(origin).deliver(
      ctx(settings, { accessToken: 'z'.repeat(30) }, http),
    );
    assert.deepEqual(r, { ok: true, link: { externalId: '35436', externalKey: null } });
    assert.equal(calls[0]?.url, 'https://zd.test/api/v2/tickets?external_id=TS-2026-000123');
    const post = calls[1];
    assert.equal(post?.url, 'https://zd.test/api/v2/tickets');
    assert.equal(post?.headers['idempotency-key'], 'dlv_1');
    assert.equal(post?.headers.authorization, `Bearer ${'z'.repeat(30)}`);
    const body = JSON.parse(post?.body ?? '{}') as {
      ticket: Record<string, unknown> & { comment: { public: boolean; body: string } };
    };
    assert.equal(body.ticket.external_id, 'TS-2026-000123');
    assert.equal(body.ticket.status, 'open');
    assert.equal(body.ticket.comment.public, false);
    assert.match(String(body.ticket.subject), /TS-2026-000123 · LTX-500 · E37/);
  });

  test('свързан тикет: PUT със статус и коментар; API token (остарял) — Basic {email}/token:{token}', async () => {
    const { http, calls } = fakeHttp(() => ({ status: 200, body: '{}' }));
    const r = await zendeskConnector(origin).deliver(
      ctx(
        { ...settings, authMode: 'api_token' as const },
        { email: 'svc@acme.test', apiToken: 't'.repeat(24) },
        http,
        {
          link: { externalId: '35436', externalKey: null },
          event: { ...EVENT, type: 'ticket.info_requested', to: 'WAITING' },
        },
      ),
    );
    assert.deepEqual(r, { ok: true });
    assert.equal(calls[0]?.method, 'PUT');
    assert.equal(calls[0]?.url, 'https://zd.test/api/v2/tickets/35436');
    assert.equal(
      calls[0]?.headers.authorization,
      `Basic ${Buffer.from(`svc@acme.test/token:${'t'.repeat(24)}`).toString('base64')}`,
    );
    const body = JSON.parse(calls[0]?.body ?? '{}') as {
      ticket: { status: string; comment: { public: boolean } };
    };
    assert.equal(body.ticket.status, 'pending');
    assert.equal(body.ticket.comment.public, false);
  });

  test('без тайни → secrets_missing (окончателно); 401 → окончателно', async () => {
    const { http } = fakeHttp(() => ({ status: 401 }));
    assert.deepEqual(await zendeskConnector(origin).deliver(ctx(settings, {}, http)), {
      ok: false,
      retry: false,
      code: 'secrets_missing',
    });
    const r = await zendeskConnector(origin).deliver(
      ctx(settings, { accessToken: 'z'.repeat(30) }, http),
    );
    assert.deepEqual(r, { ok: false, retry: false, code: 'http_401' });
  });
});

describe('Jira Service Management', () => {
  const settings: JsmConfig = {
    baseUrl: 'https://acme.atlassian.net',
    serviceDeskId: '10',
    requestTypeId: '25',
    language: 'it',
  };
  const secrets = { email: 'svc@acme.test', apiToken: 'j'.repeat(24) };

  test('нов: търсене по номера (searchTerm) → POST request; свързан: вътрешен коментар по ключа', async () => {
    const { http, calls } = fakeHttp((req) =>
      req.method === 'GET'
        ? { status: 200, body: JSON.stringify({ values: [] }) }
        : { status: 201, body: JSON.stringify({ issueId: '107001', issueKey: 'HELPDESK-1' }) },
    );
    const r = await jsmConnector.deliver(ctx(settings, secrets, http));
    assert.deepEqual(r, { ok: true, link: { externalId: '107001', externalKey: 'HELPDESK-1' } });
    assert.match(
      calls[0]?.url ?? '',
      /\/rest\/servicedeskapi\/request\?searchTerm=TS-2026-000123&serviceDeskId=10&requestOwnership=OWNED_REQUESTS/,
    );
    const created = JSON.parse(calls[1]?.body ?? '{}') as Record<string, unknown> & {
      requestFieldValues: Record<string, string>;
    };
    assert.equal(created.serviceDeskId, '10');
    assert.equal(created.requestTypeId, '25');
    assert.match(created.requestFieldValues.summary ?? '', /TS-2026-000123/);
    assert.equal(
      calls[1]?.headers.authorization,
      `Basic ${Buffer.from(`svc@acme.test:${'j'.repeat(24)}`).toString('base64')}`,
    );

    const second = fakeHttp(() => ({ status: 201, body: '{}' }));
    await jsmConnector.deliver(
      ctx(settings, secrets, second.http, {
        link: { externalId: '107001', externalKey: 'HELPDESK-1' },
      }),
    );
    assert.equal(
      second.calls[0]?.url,
      'https://acme.atlassian.net/rest/servicedeskapi/request/HELPDESK-1/comment',
    );
    assert.equal((JSON.parse(second.calls[0]?.body ?? '{}') as { public: boolean }).public, false);
  });

  test('заявката вече съществува (повтор след неясен изход) → връзка, без втора заявка', async () => {
    const { http, calls } = fakeHttp(() => ({
      status: 200,
      body: JSON.stringify({
        values: [
          { issueId: '9', issueKey: 'HD-9', summary: '[ChatChat] TS-2026-000123 · LTX-500' },
        ],
      }),
    }));
    const r = await jsmConnector.deliver(
      ctx(settings, secrets, http, { event: { ...EVENT, type: 'ticket.created' } }),
    );
    assert.deepEqual(r, {
      ok: true,
      skipped: 'already_linked',
      link: { externalId: '9', externalKey: 'HD-9' },
    });
    assert.equal(calls.length, 1);
  });
});

describe('общият webhook', () => {
  test('подписан JSON с версия; Idempotency-Key = id на доставката; получателят връща externalId', async () => {
    const secret = 's'.repeat(40);
    const { http, calls } = fakeHttp(() => ({
      status: 200,
      body: JSON.stringify({ externalId: 'EXT-1' }),
    }));
    const settings: WebhookConfig = { url: 'https://hooks.example.com/chatchat', language: 'it' };
    const r = await webhookConnector.deliver(ctx(settings, { signingSecret: secret }, http));
    assert.deepEqual(r, { ok: true, link: { externalId: 'EXT-1', externalKey: null } });
    const req = calls[0];
    assert.ok(req);
    assert.equal(req.headers['idempotency-key'], 'dlv_1');
    const body = JSON.parse(req.body ?? '{}') as {
      version: number;
      type: string;
      ticket: ExternalTicket;
    };
    assert.equal(body.version, 1);
    assert.equal(body.type, 'ticket.claimed');
    assert.equal(body.ticket.ticket.number, 'TS-2026-000123');
    const now = Number(req.headers[CC_TIMESTAMP]) * 1000;
    assert.equal(verifyChatChat(secret, req.headers, req.body ?? '', now, 300).ok, true);
  });
});
