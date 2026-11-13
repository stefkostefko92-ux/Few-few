import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { invalidateSettings } = await import('../../src/admin/settings.js');
const { saveIntegration } = await import('../../src/admin/integrations.js');
const { activatePayment, createOrder, quotePlan, BillingError } =
  await import('../../src/billing/orders.js');
const { reconcileCardPayments, settleRevolutOrder } = await import('../../src/billing/card.js');
const { expireSubscriptions } = await import('../../src/billing/expiry.js');
const { verifyChain, sha256 } = await import('../../src/ledger/chain.js');
const { sealHmac } = await import('../../src/auth/keys.js');
const { paidOn } = await import('../../src/routes/admin-actions.js');

/**
 * SPEC 49–50: поръчка на план с карта (Revolut — фалшив сървър тук) и по банков път; активиране само
 * след проверка; фактура от Карбон Стелт в същата транзакция, BT-7 = датата на плащането; идемпотентност.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const WSK = 'wsk_billing_test_secret_123456';
const REVOLUT = 'https://sandbox-merchant.revolut.com';
let http: HttpClient;
let customer: Session;
let customerOrgId = '';
let supplierOrgId = '';
let masterId = '';

/** Фалшивият Revolut: поръчките са в паметта; всичко друго минава към истинския fetch. */
interface FakeOrder {
  id: string;
  state: string;
  amount: number;
  currency: string;
  reference: string;
  paidAt: string;
}
const orders = new Map<string, FakeOrder>();
const realFetch = globalThis.fetch;
let revolutDown = false;
let dropCreateResponse = false;
let created = 0;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(REVOLUT)) return realFetch(input, init);
  if (revolutDown) throw new TypeError('fetch failed');
  const path = url.slice(REVOLUT.length);
  const view = (o: FakeOrder) => ({
    id: o.id,
    state: o.state,
    amount: o.amount,
    outstanding_amount: o.state === 'completed' ? 0 : o.amount,
    currency: o.currency,
    merchant_order_data: { reference: o.reference },
    checkout_url: `https://checkout.revolut.test/pay/${o.id}`,
    payments:
      o.state === 'completed'
        ? [{ id: 'p1', state: 'completed', created_at: o.paidAt, updated_at: o.paidAt }]
        : [],
  });
  if (init?.method === 'POST' && path === '/api/orders') {
    const body = JSON.parse(String(init.body)) as {
      amount: number;
      currency: string;
      merchant_order_data: { reference: string };
      capture_mode: string;
    };
    assert.equal(body.capture_mode, 'automatic');
    created += 1;
    const order: FakeOrder = {
      id: `0000000${created}-aaaa-bbbb-cccc-ddddeeeeffff`,
      state: 'pending',
      amount: body.amount,
      currency: body.currency,
      reference: body.merchant_order_data.reference,
      paidAt: '',
    };
    orders.set(order.id, order);
    // Поръчката е създадена, а отговорът се губи по пътя (таймаут).
    if (dropCreateResponse) throw new TypeError('fetch failed');
    return Response.json(view(order), { status: 201 });
  }
  const list = /^\/api\/orders\?merchant_order_data_reference=([A-Z0-9-]+)&limit=5$/.exec(path);
  if (list) {
    const found = [...orders.values()].filter((o) => o.reference === list[1]);
    return Response.json({ orders: found.map((o) => ({ id: o.id, state: o.state })) });
  }
  const one = /^\/api\/orders\/([A-Za-z0-9-]+)$/.exec(path);
  if (one) {
    const order = orders.get(one[1]!);
    return order ? Response.json(view(order)) : new Response(null, { status: 404 });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;

function pay(orderId: string, paidAt: string, amount?: number): void {
  const order = orders.get(orderId);
  assert.ok(order, 'поръчката е при Revolut');
  order.state = 'completed';
  order.paidAt = paidAt;
  if (amount !== undefined) order.amount = amount;
}

function webhook(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', WSK).update(`v1.${timestamp}.${raw}`).digest('hex');
  return realFetch(`${http.origin}/webhooks/revolut`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'revolut-request-timestamp': timestamp,
      'revolut-signature': `v1=${signature}`,
    },
    body: raw,
  });
}

const base = {
  password: PASSWORD,
  acceptTerms: 'on',
  addressStreet: 'ул. „Витоша“ 1',
  addressCity: 'София',
  postalCode: '1000',
} as const;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  masterId = (
    await prisma.user.create({
      data: {
        email: 'master@example.test',
        name: 'Мастър',
        passwordHash: 'x',
        platformRole: 'MASTER',
      },
    })
  ).id;
  const supplier = await register({
    ...base,
    kind: 'company',
    name: 'Стефан Костадинов',
    email: 'supplier@example.test',
    legalName: 'Карбон Стелт ЕООД',
    eik: '208725180',
    vatNumber: 'BG208725180',
  });
  supplierOrgId = supplier.organizationId;
  await prisma.organization.update({
    where: { id: supplierOrgId },
    data: { iban: 'BG80BNBG96611020345678', bic: 'BNBGBGSF' },
  });
  const buyer = await register({
    ...base,
    kind: 'company',
    name: 'Иван Петров',
    email: 'customer@example.test',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    vatNumber: 'BG131063188',
  });
  customerOrgId = buyer.organizationId;
  await saveIntegration({
    code: 'revolut',
    config: { environment: 'sandbox' },
    secrets: { secretKey: 'sk_test_billing_key_0000000000', webhookSecret: WSK },
    changed: ['secretKey', 'webhookSecret'],
    cleared: [],
    actorId: masterId,
  });
  await prisma.notification.deleteMany();
  http = await startHttp(createServer);
  customer = await http.login('customer@example.test', PASSWORD);
});

after(async () => {
  globalThis.fetch = realFetch;
  await http.close();
  await prisma.$disconnect();
});

test('без доставчик в настройките поръчките са затворени', async () => {
  await assert.rejects(
    createOrder({
      organizationId: customerOrgId,
      actorId: masterId,
      planCode: 'pro',
      interval: 'MONTH',
      method: 'transfer',
    }),
    (error: unknown) => error instanceof BillingError && error.code === 'noSupplier',
  );
  const page = await (await http.get(customer, `/app/o/${customerOrgId}/plan`)).text();
  assert.match(page, /още не е отворена/);
  await prisma.setting.upsert({
    where: { key: 'billing.supplierOrgId' },
    create: { key: 'billing.supplierOrgId', value: supplierOrgId },
    update: { value: supplierOrgId },
  });
  invalidateSettings();
});

test('цената е от сървъра: ДДС 20 % върху цели центове; безплатният и „по договор“ не се поръчват', async () => {
  const month = await quotePlan(customerOrgId, 'pro', 'MONTH');
  assert.deepEqual(
    { net: month.netCents, vat: month.vatCents, total: month.totalCents },
    { net: 900, vat: 180, total: 1080 },
  );
  const year = await quotePlan(customerOrgId, 'business', 'YEAR');
  assert.equal(year.totalCents, 29000 + 5800);
  await assert.rejects(quotePlan(customerOrgId, 'free', 'MONTH'), /free/);
  await assert.rejects(quotePlan(customerOrgId, 'enterprise', 'MONTH'), /notFound|noPrice/);
  await assert.rejects(quotePlan(customerOrgId, 'firm', 'MONTH'), /audience/);
  await assert.rejects(quotePlan(supplierOrgId, 'pro', 'MONTH'), /notFound/);
  // Сума от формата не съществува: полето се пренебрегва, записът е от сървъра.
  const res = await http.post(customer, `/app/o/${customerOrgId}/plan/poruchka`, {
    choice: 'pro:MONTH',
    method: 'transfer',
    amountCents: '1',
  });
  assert.equal(res.status, 303);
  const payment = await prisma.payment.findFirstOrThrow({
    where: { organizationId: customerOrgId, status: 'PENDING' },
  });
  assert.equal(payment.amountCents, 1080);
  assert.equal(payment.provider, 'MANUAL');
  assert.match(payment.reference ?? '', /^FKT-[A-Z2-9]{8}$/);
});

test('банков превод: проформа с основанието, мастърът потвърждава → план + фактура с BT-7', async () => {
  const payment = await prisma.payment.findFirstOrThrow({
    where: { organizationId: customerOrgId, status: 'PENDING' },
  });
  const pageRes = await http.get(customer, `/app/o/${customerOrgId}/plan/${payment.id}`);
  const page = await pageRes.text();
  assert.match(page, new RegExp(payment.reference!));
  assert.match(page, /BG80BNBG96611020345678/);
  const proforma = await http.get(
    customer,
    `/app/o/${customerOrgId}/plan/${payment.id}/proforma.pdf`,
  );
  assert.equal(proforma.status, 200);
  assert.equal(proforma.headers.get('content-type'), 'application/pdf');

  const paidAt = new Date('2026-11-10T12:00:00Z');
  const result = await activatePayment({ paymentId: payment.id, paidAt, confirmedById: masterId });
  assert.equal(result.activated, true);
  // Второ потвърждение (двоен клик) не прави нищо.
  assert.equal((await activatePayment({ paymentId: payment.id, paidAt })).activated, false);

  const done = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.confirmedById, masterId);
  const subscription = await prisma.subscription.findFirstOrThrow({
    where: { organizationId: customerOrgId, status: 'ACTIVE' },
  });
  assert.equal(subscription.planCode, 'pro');
  assert.equal(subscription.currentPeriodStart.toISOString(), paidAt.toISOString());
  assert.equal(subscription.currentPeriodEnd.toISOString(), '2026-12-10T12:00:00.000Z');

  const invoice = await prisma.document.findUniqueOrThrow({
    where: { id: done.invoiceDocumentId! },
  });
  assert.equal(invoice.organizationId, supplierOrgId);
  assert.equal(invoice.buyerEik, '131063188');
  assert.equal(invoice.payableCents, 0n, 'платено предварително (BT-113)');
  assert.equal(invoice.taxExclusiveCents, 900n);
  assert.equal(invoice.vatCents, 180n);
  assert.match(invoice.ublXml ?? '', /<cbc:TaxPointDate>2026-11-10<\/cbc:TaxPointDate>/);
  assert.match(
    invoice.ublXml ?? '',
    /<cbc:PrepaidAmount currencyID="EUR">10\.80<\/cbc:PrepaidAmount>/,
  );
  assert.match(invoice.ublXml ?? '', /основание FKT-/);
  // Фактурата е в шкафчето на клиента и писмото — в опашката.
  const entry = await prisma.inboxEntry.findFirstOrThrow({
    where: { documentId: invoice.id, recipientOrgId: customerOrgId },
  });
  assert.ok(entry);
  const history = await (await http.get(customer, `/app/o/${customerOrgId}/plan`)).text();
  assert.match(history, new RegExp(`/shkafche/${entry.id}`));
  const docs = await prisma.document.findMany({
    where: { organizationId: supplierOrgId },
    orderBy: { chainIndex: 'asc' },
  });
  const problem = verifyChain(
    docs.map((d) => ({
      organizationId: d.organizationId,
      chainIndex: d.chainIndex!,
      number: d.number ?? '',
      typeCode: d.typeCode,
      status: 'ISSUED' as const,
      issueDate: d.issueDate.toISOString().slice(0, 10),
      payableCents: d.payableCents,
      vatCents: d.vatCents,
      ublSha256: sha256(d.ublXml ?? ''),
      ciiSha256: sha256(d.ciiXml ?? ''),
      prevHash: d.prevHash ?? '',
      sha256: d.sha256 ?? '',
      seal: d.seal ?? '',
    })),
    sealHmac,
  );
  assert.equal(problem, null, 'веригата на доставчика е цяла');
  const audit = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'billing.payment.completed', targetId: payment.id },
  });
  assert.equal(audit.actorId, masterId);
});

test('карта: поръчка при Revolut, webhook → повторно четене → активиране; повторният webhook — нищо', async () => {
  const res = await http.post(customer, `/app/o/${customerOrgId}/plan/poruchka`, {
    choice: 'pro:MONTH',
    method: 'card',
  });
  assert.equal(res.status, 303);
  const payment = await prisma.payment.findFirstOrThrow({
    where: { organizationId: customerOrgId, status: 'PENDING', provider: 'REVOLUT' },
  });
  assert.ok(payment.providerOrderId);
  assert.equal(orders.get(payment.providerOrderId!)?.amount, 1080);
  assert.equal(orders.get(payment.providerOrderId!)?.reference, payment.reference);
  const page = await (
    await http.get(customer, `/app/o/${customerOrgId}/plan/${payment.id}`)
  ).text();
  assert.match(page, /checkout\.revolut\.test\/pay\//);

  // Връщането от Revolut само показва „обработва се“ — не дава права.
  const back = await (
    await http.get(customer, `/app/o/${customerOrgId}/plan/${payment.id}?vrashtane=1`)
  ).text();
  assert.match(back, /http-equiv="refresh"/);
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    'PENDING',
  );
  // Webhook преди плащането: събитието е сигнал, поръчката още е pending → нищо.
  assert.equal(
    (await webhook({ event: 'ORDER_COMPLETED', order_id: payment.providerOrderId })).status,
    200,
  );
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    'PENDING',
  );

  pay(payment.providerOrderId!, '2026-11-12T08:30:00Z');
  assert.equal(
    (await webhook({ event: 'ORDER_COMPLETED', order_id: payment.providerOrderId })).status,
    200,
  );
  const done = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.paidAt?.toISOString(), '2026-11-12T08:30:00.000Z', 'часът е на Revolut');
  const invoice = await prisma.document.findUniqueOrThrow({
    where: { id: done.invoiceDocumentId! },
  });
  assert.match(invoice.ublXml ?? '', /<cbc:TaxPointDate>2026-11-12<\/cbc:TaxPointDate>/);
  assert.match(invoice.ublXml ?? '', /<cbc:PaymentMeansCode>48<\/cbc:PaymentMeansCode>/);
  // Същият план продължава: новият период започва от края на предишния.
  const active = await prisma.subscription.findFirstOrThrow({
    where: { organizationId: customerOrgId, status: 'ACTIVE' },
  });
  assert.equal(active.currentPeriodStart.toISOString(), '2026-12-10T12:00:00.000Z');
  assert.equal(active.currentPeriodEnd.toISOString(), '2027-01-10T12:00:00.000Z');

  const invoices = await prisma.document.count({ where: { organizationId: supplierOrgId } });
  assert.equal(
    (await webhook({ event: 'ORDER_COMPLETED', order_id: payment.providerOrderId })).status,
    200,
  );
  assert.equal((await settleRevolutOrder(payment.providerOrderId!)).toString(), 'already');
  assert.equal(await prisma.document.count({ where: { organizationId: supplierOrgId } }), invoices);
});

test('сумата при Revolut не съвпада → не се активира, одит; невалиден подпис → 401', async () => {
  const { paymentId } = await createOrder({
    organizationId: customerOrgId,
    actorId: masterId,
    planCode: 'business',
    interval: 'MONTH',
    method: 'card',
  });
  const { startCardCheckout } = await import('../../src/billing/card.js');
  await startCardCheckout({
    paymentId,
    organizationId: customerOrgId,
    redirectUrl: 'https://x.test/',
  });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  pay(payment.providerOrderId!, '2026-11-12T09:00:00Z', 100);
  assert.equal(await settleRevolutOrder(payment.providerOrderId!), 'mismatch');
  // За решение от мастъра: FAILED с датата на плащането, един запис в одита — проверката не го чете пак.
  const marked = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(marked.status, 'FAILED');
  assert.ok(marked.paidAt);
  assert.equal(await settleRevolutOrder(payment.providerOrderId!), 'mismatch');
  await prisma.payment.update({
    where: { id: paymentId },
    data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
  });
  assert.equal(await reconcileCardPayments(), 0);
  assert.equal(
    await prisma.auditLog.count({
      where: { action: 'billing.payment.review', targetId: paymentId },
    }),
    1,
  );
  const bad = await realFetch(`${http.origin}/webhooks/revolut`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'revolut-request-timestamp': String(Date.now()),
      'revolut-signature': 'v1=00',
    },
    body: JSON.stringify({ event: 'ORDER_COMPLETED', order_id: payment.providerOrderId }),
  });
  assert.equal(bad.status, 401);
});

test('заменена поръчка, платена след по-нов ДРУГ платен план → не го пипа, чака мастъра', async () => {
  const first = await createOrder({
    organizationId: customerOrgId,
    actorId: masterId,
    planCode: 'business',
    interval: 'YEAR',
    method: 'card',
  });
  const { startCardCheckout } = await import('../../src/billing/card.js');
  await startCardCheckout({
    paymentId: first.paymentId,
    organizationId: customerOrgId,
    redirectUrl: 'https://x.test/',
  });
  // Нова поръчка затваря старата като CANCELLED — не FAILED.
  await createOrder({
    organizationId: customerOrgId,
    actorId: masterId,
    planCode: 'pro',
    interval: 'MONTH',
    method: 'transfer',
  });
  const old = await prisma.payment.findUniqueOrThrow({ where: { id: first.paymentId } });
  assert.equal(old.status, 'CANCELLED');
  pay(old.providerOrderId!, '2026-11-12T10:00:00Z');
  await prisma.payment.update({
    where: { id: old.id },
    data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
  });
  // Активният „Професионален“ е платен до 10.01.2027 — годишният „Бизнес“ не го прекратява мълчаливо.
  assert.equal(await reconcileCardPayments(), 0);
  const review = await prisma.payment.findUniqueOrThrow({ where: { id: old.id } });
  assert.equal(review.status, 'FAILED');
  assert.equal(review.paidAt?.toISOString(), '2026-11-12T10:00:00.000Z');
  const audit = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'billing.payment.review', targetId: old.id },
  });
  assert.equal((audit.details as { reason: string }).reason, 'superseded');
  const active = await prisma.subscription.findFirstOrThrow({
    where: { organizationId: customerOrgId, status: 'ACTIVE' },
  });
  assert.equal(active.planCode, 'pro');
  assert.equal(active.currentPeriodEnd.toISOString(), '2027-01-10T12:00:00.000Z');
});

test('Revolut недостъпен при създаването → търсене по основанието, не втора поръчка', async () => {
  const before = created;
  const { paymentId } = await createOrder({
    organizationId: customerOrgId,
    actorId: masterId,
    planCode: 'pro',
    interval: 'MONTH',
    method: 'card',
  });
  revolutDown = true;
  const res = await http.post(customer, `/app/o/${customerOrgId}/plan/${paymentId}/karta`, {});
  revolutDown = false;
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location') ?? '', /err=revolut/);
  assert.equal(created, before, 'нищо не е създадено при Revolut');
  const retry = await http.post(customer, `/app/o/${customerOrgId}/plan/${paymentId}/karta`, {});
  assert.equal(retry.headers.get('location'), `/app/o/${customerOrgId}/plan/${paymentId}`);
  assert.equal(created, before + 1);
  await http.post(customer, `/app/o/${customerOrgId}/plan/${paymentId}/otkazhi`, {});

  // Създадена при Revolut, отговорът изгубен → намира се по основанието; втора поръчка няма.
  const lost = await createOrder({
    organizationId: customerOrgId,
    actorId: masterId,
    planCode: 'pro',
    interval: 'MONTH',
    method: 'card',
  });
  dropCreateResponse = true;
  const recovered = await http.post(
    customer,
    `/app/o/${customerOrgId}/plan/${lost.paymentId}/karta`,
    {},
  );
  dropCreateResponse = false;
  assert.equal(recovered.headers.get('location'), `/app/o/${customerOrgId}/plan/${lost.paymentId}`);
  const withOrder = await prisma.payment.findUniqueOrThrow({ where: { id: lost.paymentId } });
  assert.equal([...orders.values()].filter((o) => o.reference === withOrder.reference).length, 1);
  assert.ok(withOrder.providerOrderId && withOrder.checkoutUrl);
  await http.post(customer, `/app/o/${customerOrgId}/plan/${lost.paymentId}/otkazhi`, {});
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status,
    'CANCELLED',
  );

  // Страница за плащане на поръчка отпреди 24 ч: не се отваря — само нова поръчка.
  const stale = await createOrder({
    organizationId: customerOrgId,
    actorId: masterId,
    planCode: 'pro',
    interval: 'MONTH',
    method: 'card',
  });
  await prisma.payment.update({
    where: { id: stale.paymentId },
    data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
  });
  const expired = await http.post(
    customer,
    `/app/o/${customerOrgId}/plan/${stale.paymentId}/karta`,
    {},
  );
  assert.match(expired.headers.get('location') ?? '', /err=expired/);
  const page = await (
    await http.get(customer, `/app/o/${customerOrgId}/plan/${stale.paymentId}`)
  ).text();
  assert.match(page, /изтекла/);
  await http.post(customer, `/app/o/${customerOrgId}/plan/${stale.paymentId}/otkazhi`, {});
});

test('изтекъл платен период → началният план; данните остават', async () => {
  const later = new Date('2028-06-01T00:00:00Z');
  assert.equal(await expireSubscriptions(later), 1);
  const active = await prisma.subscription.findFirstOrThrow({
    where: { organizationId: customerOrgId, status: 'ACTIVE' },
  });
  assert.equal(active.planCode, 'free');
  assert.equal(await expireSubscriptions(later), 0);
});

test('на безплатен план заменена, но платена поръчка се активира; дата по софийско време; сметка и при карта', async () => {
  await prisma.setting.upsert({
    where: { key: 'issue.requireBankAccount' },
    create: { key: 'issue.requireBankAccount', value: true },
    update: { value: true },
  });
  invalidateSettings();
  const first = await createOrder({
    organizationId: customerOrgId,
    actorId: masterId,
    planCode: 'business',
    interval: 'MONTH',
    method: 'card',
  });
  const { startCardCheckout } = await import('../../src/billing/card.js');
  await startCardCheckout({
    paymentId: first.paymentId,
    organizationId: customerOrgId,
    redirectUrl: 'https://x.test/',
  });
  await createOrder({
    organizationId: customerOrgId,
    actorId: masterId,
    planCode: 'pro',
    interval: 'MONTH',
    method: 'transfer',
  });
  const old = await prisma.payment.findUniqueOrThrow({ where: { id: first.paymentId } });
  assert.equal(old.status, 'CANCELLED');
  // 31.10.2026 22:30 UTC = 01.11.2026 00:30 в София — данъчното събитие е в ноември.
  pay(old.providerOrderId!, '2026-10-31T22:30:00Z');
  await prisma.payment.update({
    where: { id: old.id },
    data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
  });
  assert.equal(await reconcileCardPayments(), 1);
  const done = await prisma.payment.findUniqueOrThrow({ where: { id: old.id } });
  assert.equal(done.status, 'COMPLETED');
  const invoice = await prisma.document.findUniqueOrThrow({
    where: { id: done.invoiceDocumentId! },
  });
  assert.match(invoice.ublXml ?? '', /<cbc:TaxPointDate>2026-11-01<\/cbc:TaxPointDate>/);
  assert.match(invoice.ublXml ?? '', /<cbc:PaymentMeansCode>48<\/cbc:PaymentMeansCode>/);
  assert.match(invoice.ublXml ?? '', /BG80BNBG96611020345678/);
  const active = await prisma.subscription.findMany({
    where: { organizationId: customerOrgId, status: 'ACTIVE' },
  });
  assert.equal(active.length, 1);
  assert.equal(active[0]!.planCode, 'business');
  assert.equal(await reconcileCardPayments(), 0, 'втори път — нищо');
  await prisma.setting.update({
    where: { key: 'issue.requireBankAccount' },
    data: { value: false },
  });
  invalidateSettings();
});

test('чужда фирма и член без billing.manage не стигат до плана', async () => {
  const supplierSession = await http.login('supplier@example.test', PASSWORD);
  assert.equal((await http.get(supplierSession, `/app/o/${customerOrgId}/plan`)).status, 404);
  const payment = await prisma.payment.findFirstOrThrow({
    where: { organizationId: customerOrgId },
  });
  assert.equal(
    (await http.get(supplierSession, `/app/o/${customerOrgId}/plan/${payment.id}/proforma.pdf`))
      .status,
    404,
  );
});

test('датата от извлечението: точна, не в бъдещето, до година назад', () => {
  const now = new Date('2026-11-13T09:00:00Z');
  assert.equal(paidOn('2026-11-13', now)?.toISOString(), '2026-11-13T12:00:00.000Z');
  assert.equal(paidOn('2026-11-14', now), null);
  assert.equal(paidOn('2026-02-31', now), null);
  assert.equal(paidOn('2025-01-01', now), null);
  assert.equal(paidOn('13.11.2026', now), null);
  assert.equal(paidOn(undefined, now), null);
});
