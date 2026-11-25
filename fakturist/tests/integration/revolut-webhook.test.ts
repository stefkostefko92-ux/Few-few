import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

prepareTestDatabase();

const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { saveIntegration } = await import('../../src/admin/integrations.js');
const { composeMasterMail } = await import('../../src/mail/master-mail.js');
const { recheckUnreadDisputes } = await import('../../src/billing/disputes.js');

/**
 * Кодът на отговора към Revolut и споровете. По `merchant.yaml` (2026-09-22, webhooks → responses):
 * 200–399 потвърждава доставката и Revolut НЕ праща пак; повторна доставка (3 пъти през 10 мин) има само
 * при 4XX или таймаут. Затова: искаме повторение → 4XX (409), никога 200 и никога 5XX. Спорът (`DISPUTE_*`)
 * носи само id-то: чете се с `GET /api/disputes/{id}`, връзва се с плащането, отива в одита и при мастъра
 * със срока за отговор — планът НЕ се пипа автоматично.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const WSK = ['wsk', 'webhook_test_secret_123456'].join('_');
const REVOLUT = 'https://sandbox-merchant.revolut.com';
const MASTER_EMAIL = 'master@example.test';
let http: HttpClient;
let orgId = '';

interface FakeOrder {
  id: string;
  state: string;
  amount: number;
}
const orders = new Map<string, FakeOrder>();
const disputes = new Map<string, Record<string, unknown>>();
const disputeReads: string[] = [];
let failDisputeReads = 0;
const realFetch = globalThis.fetch;
let revolutDown = false;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(REVOLUT)) return realFetch(input, init);
  if (revolutDown) throw new TypeError('fetch failed');
  const path = url.slice(REVOLUT.length);
  const order = /^\/api\/orders\/([A-Za-z0-9-]+)$/.exec(path);
  if (order) {
    const o = orders.get(order[1]!);
    if (!o) return new Response(null, { status: 404 });
    const paid = o.state === 'completed';
    return Response.json({
      id: o.id,
      state: o.state,
      amount: o.amount,
      outstanding_amount: paid ? 0 : o.amount,
      currency: 'EUR',
      merchant_order_data: { reference: referenceOf(o.id) },
      payments: paid ? [{ id: 'p1', state: 'completed', updated_at: '2026-11-17T08:00:00Z' }] : [],
    });
  }
  const dispute = /^\/api\/disputes\/([A-Za-z0-9-]+)$/.exec(path);
  if (dispute) disputeReads.push(dispute[1]!);
  if (dispute && failDisputeReads > 0) {
    failDisputeReads -= 1;
    return new Response(null, { status: 503 });
  }
  if (dispute) {
    const d = disputes.get(dispute[1]!);
    return d ? Response.json(d) : new Response(null, { status: 404 });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;

const referenceOf = (orderId: string) => `FKT-${orderId.slice(0, 8).toUpperCase()}`;

function signed(raw: string): Record<string, string> {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', WSK).update(`v1.${timestamp}.${raw}`).digest('hex');
  return {
    'content-type': 'application/json',
    'revolut-request-timestamp': timestamp,
    'revolut-signature': `v1=${signature}`,
  };
}

function webhook(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  return realFetch(`${http.origin}/webhooks/revolut`, {
    method: 'POST',
    headers: signed(raw),
    body: raw,
  });
}

/** Плащане с карта без план (активирането е само COMPLETED) — достатъчно за кода на отговора. */
async function cardPayment(orderId: string, status: 'PENDING' | 'COMPLETED' = 'PENDING') {
  orders.set(orderId, {
    id: orderId,
    state: status === 'COMPLETED' ? 'completed' : 'pending',
    amount: 1200,
  });
  return prisma.payment.create({
    data: {
      organizationId: orgId,
      amountCents: 1200,
      currency: 'EUR',
      provider: 'REVOLUT',
      providerOrderId: orderId,
      reference: referenceOf(orderId),
      status,
      paidAt: status === 'COMPLETED' ? new Date('2026-11-10T08:00:00Z') : null,
    },
  });
}

const disputeNotices = () =>
  prisma.notification.findMany({
    where: { kind: 'master.dispute' },
    orderBy: { createdAt: 'asc' },
  });
const disputeAudits = (disputeId: string) =>
  prisma.auditLog.findMany({
    where: { action: 'billing.payment.disputed', targetId: disputeId },
    orderBy: { id: 'asc' },
  });

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  await prisma.user.create({
    data: { email: 'en@example.test', name: 'EN', passwordHash: 'x', locale: 'en' },
  });
  const masterId = (
    await prisma.user.create({
      data: { email: MASTER_EMAIL, name: 'Мастър', passwordHash: 'x', platformRole: 'MASTER' },
    })
  ).id;
  const buyer = await register({
    password: PASSWORD,
    acceptTerms: 'on',
    addressStreet: 'ул. „Витоша“ 1',
    addressCity: 'София',
    postalCode: '1000',
    kind: 'company',
    name: 'Иван Петров',
    email: 'customer@example.test',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    vatNumber: 'BG131063188',
  });
  orgId = buyer.organizationId;
  await saveIntegration({
    code: 'revolut',
    config: { environment: 'sandbox' },
    secrets: { secretKey: 'sk_test_webhook_key_0000000000', webhookSecret: WSK },
    changed: ['secretKey', 'webhookSecret'],
    cleared: [],
    actorId: masterId,
  });
  await prisma.notification.deleteMany();
  http = await startHttp(createServer);
});

after(async () => {
  globalThis.fetch = realFetch;
  await http.close();
  await prisma.$disconnect();
});

test('F4: вътрешна грешка (Revolut недостъпен при повторното четене) → 409, не 5XX; повторната доставка довършва', async () => {
  const orderId = 'f4f4f4f4-0000-4000-8000-000000000001';
  const payment = await cardPayment(orderId);
  orders.get(orderId)!.state = 'completed';
  revolutDown = true;
  const failed = await webhook({ event: 'ORDER_COMPLETED', order_id: orderId });
  revolutDown = false;
  assert.equal(failed.status, 409, '4XX — само тогава Revolut праща пак; 5XX не е описан');
  const event = await prisma.webhookEvent.findUniqueOrThrow({
    where: { eventKey: `revolut:ORDER_COMPLETED:${orderId}` },
  });
  assert.equal(event.processedAt, null, 'необработено — повторната доставка опитва пак');
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    'PENDING',
  );
  const again = await webhook({ event: 'ORDER_COMPLETED', order_id: orderId });
  assert.equal(again.status, 200);
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    'COMPLETED',
  );
});

test('F3: ORDER_COMPLETED, а поръчката още не е платена → 409 (200 би потвърдило доставката и Revolut не праща пак)', async () => {
  const orderId = 'f3f3f3f3-0000-4000-8000-000000000001';
  const payment = await cardPayment(orderId);
  const early = await webhook({ event: 'ORDER_COMPLETED', order_id: orderId });
  assert.equal(early.status, 409);
  const event = await prisma.webhookEvent.findUniqueOrThrow({
    where: { eventKey: `revolut:ORDER_COMPLETED:${orderId}` },
  });
  assert.equal(event.processedAt, null);
  orders.get(orderId)!.state = 'completed';
  assert.equal((await webhook({ event: 'ORDER_COMPLETED', order_id: orderId })).status, 200);
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    'COMPLETED',
  );
  // Обработеното не се обработва пак — 200.
  assert.equal((await webhook({ event: 'ORDER_COMPLETED', order_id: orderId })).status, 200);
});

test('лош подпис и лошо тяло пазят кодовете си: 401 и 400', async () => {
  const raw = JSON.stringify({
    event: 'ORDER_COMPLETED',
    order_id: 'f3f3f3f3-0000-4000-8000-000000000009',
  });
  const badSignature = await realFetch(`${http.origin}/webhooks/revolut`, {
    method: 'POST',
    headers: { ...signed(raw), 'revolut-signature': 'v1=00' },
    body: raw,
  });
  assert.equal(badSignature.status, 401);
  const notJson = '{"event":';
  const badJson = await realFetch(`${http.origin}/webhooks/revolut`, {
    method: 'POST',
    headers: signed(notJson),
    body: notJson,
  });
  assert.equal(badJson.status, 400);
  const noEvent = JSON.stringify({ order_id: 'x' });
  const badShape = await realFetch(`${http.origin}/webhooks/revolut`, {
    method: 'POST',
    headers: signed(noEvent),
    body: noEvent,
  });
  assert.equal(badShape.status, 400);
  const noDisputeId = JSON.stringify({ event: 'DISPUTE_ACTION_REQUIRED' });
  const badDispute = await realFetch(`${http.origin}/webhooks/revolut`, {
    method: 'POST',
    headers: signed(noDisputeId),
    body: noDisputeId,
  });
  assert.equal(badDispute.status, 400);
});

test('F2: спор → четене от Revolut, връзка с плащането, одит и писмо до мастъра със срока; планът и плащането не се пипат', async () => {
  const orderId = 'f2f2f2f2-0000-4000-8000-000000000001';
  const disputeId = 'ab934829-e4ba-4e7f-8a21-365cad85c763';
  const payment = await cardPayment(orderId, 'COMPLETED');
  const subscriptionsBefore = await prisma.subscription.findMany({
    where: { organizationId: orgId },
    orderBy: { id: 'asc' },
  });
  disputes.set(disputeId, {
    id: disputeId,
    state: 'needs_response',
    substate: 'new',
    created_at: '2026-11-17T07:00:00Z',
    updated_at: '2026-11-17T07:00:00Z',
    response_due_date: '2026-12-01T10:00:00Z',
    reason_code: '50',
    reason_description: 'Fraud',
    amount: 1200,
    currency: 'EUR',
    payment: { id: 'p1', order_id: orderId },
  });
  const res = await webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId });
  assert.equal(res.status, 200);

  const audits = await disputeAudits(disputeId);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]!.organizationId, orgId);
  assert.equal(audits[0]!.targetType, 'RevolutDispute');
  const details = audits[0]!.details as Record<string, unknown>;
  assert.equal(details['state'], 'needs_response');
  assert.equal(details['paymentId'], payment.id);
  assert.equal(details['orderId'], orderId);
  assert.equal(details['responseDueAt'], '2026-12-01T10:00:00.000Z');
  assert.equal(details['amountCents'], 1200);

  const notices = await disputeNotices();
  assert.equal(notices.length, 1);
  assert.equal(notices[0]!.toEmail, MASTER_EMAIL);
  const mail = await composeMasterMail('master.dispute', MASTER_EMAIL, notices[0]!.payload);
  assert.match(mail.subject, /спор/i);
  assert.match(mail.text, /01\.12\.2026 12:00/, 'срокът — по софийско време');
  assert.match(mail.text, /Пекарна Зора ЕООД/);
  assert.match(mail.text, /131063188/);
  assert.match(mail.text, /Revolut Business/);
  assert.match(mail.text, /не спира плана/);

  // Повторна доставка на същото събитие — нищо ново (същото състояние, същият срок).
  assert.equal(
    (await webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId })).status,
    200,
  );
  assert.equal((await disputeAudits(disputeId)).length, 1);
  assert.equal((await disputeNotices()).length, 1);

  // Повторна доставка, а Revolut не отговаря: спорът вече е прочетен от същото известие — без „не се
  // прочете“ (би било невярно), 409 за още един опит.
  revolutDown = true;
  const down = await webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId });
  revolutDown = false;
  assert.equal(down.status, 409);
  assert.equal((await disputeAudits(disputeId)).length, 1);
  assert.equal((await disputeNotices()).length, 1);

  // Две доставки наведнъж (ново състояние): заключването по спора — един запис, едно писмо.
  disputes.set(disputeId, {
    ...disputes.get(disputeId)!,
    state: 'under_review',
    updated_at: '2026-11-18T07:00:00Z',
  });
  const both = await Promise.all([
    webhook({ event: 'DISPUTE_UNDER_REVIEW', dispute_id: disputeId }),
    webhook({ event: 'DISPUTE_UNDER_REVIEW', dispute_id: disputeId }),
  ]);
  assert.deepEqual(
    both.map((r) => r.status),
    [200, 200],
  );
  assert.equal((await disputeAudits(disputeId)).length, 2);
  assert.equal((await disputeNotices()).length, 2);

  // Спорът е загубен: известие и одит, но решението е на човек — плащането и планът остават.
  disputes.set(disputeId, {
    ...disputes.get(disputeId)!,
    state: 'lost',
    substate: 'lost_representment',
    updated_at: '2026-11-20T07:00:00Z',
  });
  assert.equal((await webhook({ event: 'DISPUTE_LOST', dispute_id: disputeId })).status, 200);
  assert.equal((await disputeAudits(disputeId)).length, 3);
  assert.equal((await disputeNotices()).length, 3);

  // Закъсняла доставка с по-старо състояние (updated_at преди записаното) — не се пише върху по-новото.
  disputes.set(disputeId, {
    ...disputes.get(disputeId)!,
    state: 'under_review',
    substate: 'representment',
    updated_at: '2026-11-19T07:00:00Z',
  });
  assert.equal(
    (await webhook({ event: 'DISPUTE_UNDER_REVIEW', dispute_id: disputeId })).status,
    200,
  );
  const afterStale = await disputeAudits(disputeId);
  assert.equal(afterStale.length, 3);
  assert.equal((afterStale.at(-1)!.details as Record<string, unknown>)['state'], 'lost');
  assert.equal((await disputeNotices()).length, 3);
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    'COMPLETED',
  );
  assert.deepEqual(
    await prisma.subscription.findMany({
      where: { organizationId: orgId },
      orderBy: { id: 'asc' },
    }),
    subscriptionsBefore,
    'никакво автоматично отнемане на плана',
  );
});

test('F2: спорът не се чете (само в продукция / грешка) → 409 за повторна доставка и ЕДНО известие „провери в Revolut Business“', async () => {
  const disputeId = '7a2d8f4b-1c3e-4a56-b789-0d1e2f3a4b5c';
  await prisma.notification.deleteMany();
  const first = await webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId });
  assert.equal(first.status, 409);
  let notices = await disputeNotices();
  assert.equal(notices.length, 1, 'мастърът научава веднага, дори без подробностите');
  const mail = await composeMasterMail('master.dispute', MASTER_EMAIL, notices[0]!.payload);
  assert.match(mail.text, /Revolut Business/);
  assert.match(mail.text, new RegExp(disputeId));
  assert.match(mail.text, /сега/, 'проверка веднага — срокът тече');
  assert.doesNotMatch(mail.text, /ще получите/, 'без обещание за следващо писмо');
  assert.doesNotMatch(
    mail.text,
    /Плащането|Фирма:/,
    'при непрочетен спор не знаем нито плащането, нито фирмата',
  );
  const mailEn = await composeMasterMail('master.dispute', 'en@example.test', notices[0]!.payload);
  assert.match(mailEn.text, /Check the dispute in Revolut Business now/);
  assert.doesNotMatch(mailEn.text, /you will get|No payment|Company:/);

  assert.equal(
    (await webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId })).status,
    409,
  );
  assert.equal((await disputeNotices()).length, 1, 'повторната доставка не праща второ писмо');

  // Уебхукът е спрял да опитва; Revolut вече го дава — периодичното четене (на 10 мин) го довършва.
  assert.equal(await recheckUnreadDisputes(), 1, 'още не се чете — опитът е броен');
  assert.equal((await disputeNotices()).length, 1);
  disputes.set(disputeId, {
    id: disputeId,
    state: 'needs_response',
    updated_at: '2026-11-17T09:00:00Z',
    response_due_date: '2026-12-05T09:00:00Z',
    amount: 500,
    currency: 'EUR',
  });
  assert.equal(await recheckUnreadDisputes(), 1);
  notices = await disputeNotices();
  assert.equal(notices.length, 2);
  const audits = await disputeAudits(disputeId);
  assert.equal((audits.at(-1)!.details as Record<string, unknown>)['state'], 'needs_response');
  assert.equal(audits.at(-1)!.organizationId, null, 'плащане с този id при нас няма');
  const found = await composeMasterMail('master.dispute', MASTER_EMAIL, notices[1]!.payload);
  assert.match(found.text, /Плащането не е намерено/);
  assert.match(found.text, /05\.12\.2026 11:00/);
  // Прочетеното не се чете пак, а повторна доставка не праща ново писмо.
  assert.equal(await recheckUnreadDisputes(), 0);
  assert.equal(
    (await webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId })).status,
    200,
  );
  assert.equal((await disputeNotices()).length, 2);
});

test('писмото различава „няма плащане“ от „плащането е тук, фирмата — не“', async () => {
  const base = {
    disputeId: 'c0c0c0c0-0000-4000-8000-000000000001',
    event: 'DISPUTE_ACTION_REQUIRED',
    state: 'needs_response',
    substate: null,
    amountCents: 700,
    currency: 'EUR',
    responseDueAt: null,
    planCode: null,
  };
  const noPayment = await composeMasterMail('master.dispute', MASTER_EMAIL, {
    ...base,
    organizationId: null,
    paymentId: null,
  });
  assert.match(noPayment.text, /Плащането не е намерено/);
  const noCompany = await composeMasterMail('master.dispute', MASTER_EMAIL, {
    ...base,
    organizationId: 'missing-organization',
    paymentId: 'payment-without-company',
  });
  assert.doesNotMatch(noCompany.text, /Плащането не е намерено/);
  assert.match(noCompany.text, /фирмата/);
  assert.match(noCompany.text, /payment-without-company/);
});

test('нов кръг „нужен е отговор“, докато четенето пада → запис „не се прочете“, писмо и повторно четене', async () => {
  const orderId = 'f5f5f5f5-0000-4000-8000-000000000002';
  const disputeId = 'b1b1b1b1-0000-4000-8000-000000000001';
  await cardPayment(orderId, 'COMPLETED');
  await prisma.notification.deleteMany();
  const first = {
    id: disputeId,
    state: 'needs_response',
    substate: 'new',
    updated_at: '2026-11-17T07:00:00Z',
    response_due_date: '2026-12-01T10:00:00Z',
    amount: 1200,
    currency: 'EUR',
    payment: { order_id: orderId },
  };
  disputes.set(disputeId, first);
  assert.equal(
    (await webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId })).status,
    200,
  );
  disputes.set(disputeId, { ...first, state: 'under_review', updated_at: '2026-11-18T07:00:00Z' });
  assert.equal(
    (await webhook({ event: 'DISPUTE_UNDER_REVIEW', dispute_id: disputeId })).status,
    200,
  );
  assert.equal((await disputeNotices()).length, 2);
  // Пред-арбитраж: пак DISPUTE_ACTION_REQUIRED, а Revolut не отговаря.
  revolutDown = true;
  const again = await webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId });
  revolutDown = false;
  assert.equal(again.status, 409);
  const audits = await disputeAudits(disputeId);
  assert.equal(audits.length, 3, 'новият кръг не се поглъща от стария прочетен запис');
  assert.equal((audits.at(-1)!.details as Record<string, unknown>)['state'], 'unread');
  assert.equal((await disputeNotices()).length, 3);
  // Работникът го чете, щом Revolut отговори — подробностите на новия кръг стигат до мастъра.
  disputes.set(disputeId, {
    ...first,
    substate: 'pre_arbitration',
    updated_at: '2026-11-25T07:00:00Z',
    response_due_date: '2026-12-10T10:00:00Z',
  });
  assert.ok((await recheckUnreadDisputes()) >= 1);
  const after = await disputeAudits(disputeId);
  assert.equal(after.length, 4);
  assert.equal((after.at(-1)!.details as Record<string, unknown>)['substate'], 'pre_arbitration');
  assert.equal((await disputeNotices()).length, 4);
});

test('повторното четене не изгладнява: спор, който пак не се прочете, отстъпва на останалите', async () => {
  const ids = [
    'd0d0d0d0-0000-4000-8000-000000000001',
    'd0d0d0d0-0000-4000-8000-000000000002',
    'd0d0d0d0-0000-4000-8000-000000000003',
  ];
  for (const id of ids) {
    assert.equal((await webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: id })).status, 409);
  }
  disputeReads.length = 0;
  await recheckUnreadDisputes(fetch, new Date(), 2);
  const firstRound = disputeReads.filter((id) => ids.includes(id));
  assert.equal(firstRound.length, 2, 'таванът на обиколка');
  disputeReads.length = 0;
  await recheckUnreadDisputes(fetch, new Date(), 2);
  const secondRound = disputeReads.filter((id) => ids.includes(id));
  const skipped = ids.find((id) => !firstRound.includes(id))!;
  assert.ok(secondRound.includes(skipped), 'пропуснатият в първата обиколка идва във втората');
});

test('две доставки наведнъж, едното четене пада → последният запис е прочетеното, не „не се прочете“', async () => {
  for (let round = 1; round <= 3; round += 1) {
    const disputeId = `e0e0e0e0-0000-4000-8000-00000000000${round}`;
    disputes.set(disputeId, {
      id: disputeId,
      state: 'needs_response',
      updated_at: '2026-11-17T07:00:00Z',
      response_due_date: '2026-12-01T10:00:00Z',
      amount: 900,
      currency: 'EUR',
    });
    failDisputeReads = 1;
    const both = await Promise.all([
      webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId }),
      webhook({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: disputeId }),
    ]);
    failDisputeReads = 0;
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
    const audits = await disputeAudits(disputeId);
    assert.ok(audits.length === 1 || audits.length === 2, `записи: ${audits.length}`);
    assert.equal(
      (audits.at(-1)!.details as Record<string, unknown>)['state'],
      'needs_response',
      'прочетеното печели в който и да е ред',
    );
  }
});
