import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { EConnectAccessPoint, enrollBody, recipientVerdict } from '../src/peppol/econnect.js';
import { AccessPointError } from '../src/peppol/access-point.js';
import { partyIdForVat, partyIdFromAddress } from '../src/peppol/ids.js';
import { signatureMatches } from '../src/peppol/webhook.js';

/** SPEC 57–59: клиентът към eConnect PSB по документацията им — с фалшив fetch. */
const SETTINGS = {
  environment: 'acceptance' as const,
  clientId: 'fakturist',
  clientSecret: 'тайна-12345678',
};

interface Call {
  url: string;
  init: RequestInit;
}

function fake(responder: (call: Call, n: number) => Response) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responder({ url, init }, calls.length);
  };
  return { calls, fetchImpl };
}

const token = (value = 'tok-1', expires = 3600) =>
  Response.json({ access_token: value, expires_in: expires, token_type: 'Bearer' });

test('токен: client credentials към acceptance identity, scope ap; пази се до изтичането', async () => {
  let now = 1_000_000;
  const { calls, fetchImpl } = fake((call) =>
    call.url.endsWith('/connect/token') ? token() : new Response(null, { status: 200 }),
  );
  const ap = new EConnectAccessPoint(SETTINGS, fetchImpl, () => now);
  await ap.check();
  await ap.check();
  const tokenCalls = calls.filter((c) => c.url.endsWith('/connect/token'));
  assert.equal(tokenCalls.length, 1, 'един токен за двете заявки');
  assert.equal(tokenCalls[0]!.url, 'https://accp-identity.econnect.eu/connect/token');
  const form = new URLSearchParams(String(tokenCalls[0]!.init.body));
  assert.equal(form.get('grant_type'), 'client_credentials');
  assert.equal(form.get('client_id'), 'fakturist');
  assert.equal(form.get('scope'), 'ap');
  const me = calls.find((c) => c.url.endsWith('/api/v1/me'))!;
  assert.equal(me.url, 'https://accp-psb.econnect.eu/api/v1/me');
  assert.equal((me.init.headers as Record<string, string>)['Authorization'], 'Bearer tok-1');
  now += 3600 * 1000;
  await ap.check();
  assert.equal(calls.filter((c) => c.url.endsWith('/connect/token')).length, 2, 'изтекъл — нов');
});

test('изпращане: UBL като тяло, X-EConnect-DocumentId; 409 — вече прието; 401 — нов токен веднъж', async () => {
  let sends = 0;
  const { calls, fetchImpl } = fake((call) => {
    if (call.url.endsWith('/connect/token')) return token(`tok-${calls.length}`);
    sends += 1;
    if (sends === 1) return new Response(null, { status: 401 });
    if (sends === 2) return new Response('{"id":"x"}', { status: 200 });
    return new Response(null, { status: 409 });
  });
  const ap = new EConnectAccessPoint(SETTINGS, fetchImpl);
  const first = await ap.send({
    senderPartyId: '9926:BG131063188',
    documentId: '0b8f0c1e-1111-4222-8333-944455556666',
    ubl: '<Invoice/>',
  });
  assert.deepEqual(first, { alreadyAccepted: false });
  const send = calls.filter((c) => c.url.includes('/salesInvoice/send')).at(-1)!;
  assert.equal(
    send.url,
    'https://accp-psb.econnect.eu/api/v1/9926%3ABG131063188/salesInvoice/send',
  );
  const headers = send.init.headers as Record<string, string>;
  assert.equal(headers['Content-Type'], 'application/xml');
  assert.equal(headers['X-EConnect-DocumentId'], '0b8f0c1e-1111-4222-8333-944455556666');
  assert.equal(send.init.body, '<Invoice/>');
  const again = await ap.send({
    senderPartyId: '9926:BG131063188',
    documentId: '0b8f0c1e-1111-4222-8333-944455556666',
    ubl: '<Invoice/>',
  });
  assert.deepEqual(again, { alreadyAccepted: true });
});

test('грешки: 5xx и мрежа — временни; 400 — постоянна; тайната не стига до съобщението', async () => {
  const server = fake((call) =>
    call.url.endsWith('/connect/token') ? token() : new Response('boom', { status: 503 }),
  );
  await assert.rejects(
    new EConnectAccessPoint(SETTINGS, server.fetchImpl).send({
      senderPartyId: '9926:BG1',
      documentId: 'a',
      ubl: '<x/>',
    }),
    (e: unknown) => e instanceof AccessPointError && e.retryable,
  );
  const bad = fake((call) =>
    call.url.endsWith('/connect/token')
      ? token()
      : new Response(`invalid ${SETTINGS.clientSecret}`, { status: 400 }),
  );
  await assert.rejects(
    new EConnectAccessPoint(SETTINGS, bad.fetchImpl).send({
      senderPartyId: '9926:BG1',
      documentId: 'a',
      ubl: '<x/>',
    }),
    (e: unknown) =>
      e instanceof AccessPointError &&
      !e.retryable &&
      e.code === 'rejected' &&
      !e.message.includes(SETTINGS.clientSecret),
  );
  const network = fake(() => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(
    new EConnectAccessPoint(SETTINGS, network.fetchImpl).check(),
    (e: unknown) => e instanceof AccessPointError && e.code === 'network' && e.retryable,
  );
  const refused = fake(() => new Response(null, { status: 401 }));
  await assert.rejects(
    new EConnectAccessPoint(SETTINGS, refused.fetchImpl).check(),
    (e: unknown) => e instanceof AccessPointError && e.code === 'unauthorized',
  );
});

test('регистрация: PUT v1-beta/{partyId}/enroll с визитка, възможности и известие с тайна', async () => {
  const { calls, fetchImpl } = fake((call) =>
    call.url.endsWith('/connect/token') ? token() : new Response(null, { status: 200 }),
  );
  await new EConnectAccessPoint(SETTINGS, fetchImpl).enroll({
    partyId: '9926:BG131063188',
    name: 'Пекарна Зора ЕООД',
    address: 'ул. „Раковски“ 2, 2300 Перник',
    countryCode: 'BG',
    hookUrl: 'https://fakturist.test/webhooks/peppol#secret',
  });
  const put = calls.find((c) => c.init.method === 'PUT')!;
  assert.equal(put.url, 'https://accp-psb.econnect.eu/api/v1-beta/9926%3ABG131063188/enroll');
  const body = JSON.parse(String(put.init.body)) as ReturnType<typeof enrollBody>;
  assert.equal(body.services[0]!.name, 'peppolService');
  assert.equal(body.services[0]!.isActive, true);
  assert.equal(body.services[0]!.config.businessCard.countryCode.value, 'BG');
  assert.equal(body.services[0]!.config.capabilities.invoices.state, 'on');
  assert.equal(body.hooks[0]!.action, 'https://fakturist.test/webhooks/peppol#secret');
  assert.ok(body.hooks[0]!.topics.includes('InvoiceReceived'));
});

test('адреси: 9926:BG + ДДС; от електронния адрес на документа; невалидни — null', () => {
  assert.equal(partyIdForVat('bg 131063188'), '9926:BG131063188');
  assert.equal(partyIdForVat('131063188'), null);
  assert.equal(partyIdForVat(null), null);
  assert.equal(partyIdFromAddress({ scheme: '9926', value: 'BG121604974' }), '9926:BG121604974');
  assert.equal(partyIdFromAddress({ scheme: 'x', value: 'BG1' }), null);
  assert.equal(partyIdFromAddress(undefined), null);
});

test('отговорът за получателя: само изрично да/не; иначе неясно', () => {
  assert.equal(recipientVerdict([{ partyId: '9926:BG1', canReceive: true }], '9926:bg1'), true);
  assert.equal(
    recipientVerdict({ parties: [{ id: '9926:BG1', isRegistered: false }] }, '9926:BG1'),
    false,
  );
  assert.equal(recipientVerdict([{ partyId: '9926:BG2', canReceive: true }], '9926:BG1'), null);
  assert.equal(recipientVerdict('ok', '9926:BG1'), null);
});

test('подписът на известието: HMAC-SHA256 на суровото тяло, „sha256=“ + hex', () => {
  const body = Buffer.from('{"topic":"InvoiceSent"}');
  const good = `sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`;
  assert.equal(signatureMatches(body, good, 's3cret'), true);
  assert.equal(signatureMatches(body, good, 'other'), false);
  assert.equal(signatureMatches(body, good.replace('sha256=', ''), 's3cret'), false);
  assert.equal(signatureMatches(body, undefined, 's3cret'), false);
  assert.equal(signatureMatches(Buffer.from('{"topic":"X"}'), good, 's3cret'), false);
});

test('грешка при регистрация: тайната на известията се маскира и когато е на границата на отрязването', async () => {
  const hookSecret = 'h00k-s3cret-abcdefghijklmnopqrstuvwxyz0123456789';
  const { fetchImpl } = fake((call) => {
    if (call.url.endsWith('/connect/token')) return token();
    // Тайната започва на 280-ия знак: отрязване преди маскирането би оставило половината ѝ.
    return new Response(`${'x'.repeat(250)} action=https://f.test/webhooks/peppol#${hookSecret}`, {
      status: 400,
    });
  });
  const ap = new EConnectAccessPoint(SETTINGS, fetchImpl);
  await assert.rejects(
    ap.enroll({
      partyId: '9926:BG131063188',
      name: 'Пекарна Зора ЕООД',
      address: 'Перник',
      countryCode: 'BG',
      hookUrl: `https://f.test/webhooks/peppol#${hookSecret}`,
    }),
    (error: unknown) =>
      error instanceof AccessPointError &&
      !error.message.includes(hookSecret.slice(0, 8)) &&
      error.message.length <= 300,
  );
});
