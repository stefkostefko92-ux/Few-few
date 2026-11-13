import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { runDueRecurring } = await import('../../src/recurring/run.js');
const { runReminders } = await import('../../src/documents/reminders.js');
const { composeDocumentSentMail, composeReminderMail } =
  await import('../../src/mail/document-mail.js');
const { sofiaToday } = await import('../../src/time.js');
const { addDays } = await import('../../src/recurring/schedule.js');

/** SPEC 51–52: повтарящи се фактури (по една за период), плащане по документ и напомняния. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let viewer: Session;
let orgId = '';
let seriesId = '';
let sourceId = '';
let templateId = '';
const today = sofiaToday();
const at = (iso: string) => new Date(`${iso}T09:00:00Z`);

function form(extra: Record<string, string> = {}): Record<string, string> {
  return {
    typeCode: '380',
    seriesId,
    issueDate: today,
    taxPointDate: today,
    dueDate: addDays(today, 14),
    currency: 'EUR',
    'buyer[name]': 'Сладкарница Роза ЕООД',
    'buyer[legalId]': '121604974',
    'buyer[street]': 'ул. „Шипка“ 1',
    'buyer[city]': 'София',
    'buyer[postalCode]': '1000',
    'buyer[countryCode]': 'BG',
    'buyer[email]': 'Plashtaniya@Roza.example',
    'lines[0][name]': 'Поддръжка',
    'lines[0][quantity]': '1',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '100.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
    ...extra,
  };
}

async function issue(): Promise<string> {
  const res = await http.post(owner, `/app/o/${orgId}/nov`, form());
  assert.equal(res.status, 303);
  const doc = await prisma.document.findFirstOrThrow({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
  });
  return doc.id;
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const seller = await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    vatNumber: 'BG131063188',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  });
  orgId = seller.organizationId;
  await prisma.organization.update({
    where: { id: orgId },
    data: { email: 'office@zora.example' },
  });
  const viewerUser = await prisma.user.create({
    data: {
      email: 'viewer@example.test',
      name: 'Само Гледа',
      passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: seller.userId } }))
        .passwordHash,
    },
  });
  await prisma.membership.create({
    data: { userId: viewerUser.id, organizationId: orgId, role: 'VIEWER' },
  });
  seriesId = (await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } }))
    .id;
  await prisma.notification.deleteMany();
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  viewer = await http.login('viewer@example.test', PASSWORD);
  sourceId = await issue();
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('имейлът на получателя (BT-58) е във входа и в XML-а', async () => {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: sourceId } });
  assert.match(
    doc.ublXml ?? '',
    /<cbc:ElectronicMail>plashtaniya@roza\.example<\/cbc:ElectronicMail>/,
  );
});

test('безплатният план няма повтарящи се: отказ с покана за план', async () => {
  const res = await http.post(owner, `/app/o/${orgId}/d/${sourceId}/povtaryay`, {
    name: 'Роза — поддръжка',
    frequency: 'MONTHLY',
    nextRunOn: today,
    lineName: 'Поддръжка за {период}',
  });
  assert.match(res.headers.get('location') ?? '', /err=feature/);
  assert.equal(await prisma.recurringInvoice.count(), 0);
  await prisma.subscription.updateMany({
    where: { organizationId: orgId, status: 'ACTIVE' },
    data: { planCode: 'pro' },
  });
});

test('повтаряща се от издадена фактура: един документ за период, „{период}“ в реда, падеж, писмо', async () => {
  // Дата в миналото не се приема; зрителят не създава.
  const past = await http.post(owner, `/app/o/${orgId}/d/${sourceId}/povtaryay`, {
    name: 'x',
    frequency: 'MONTHLY',
    nextRunOn: addDays(today, -1),
  });
  assert.match(past.headers.get('location') ?? '', /err=invalid/);
  const denied = await http.post(viewer, `/app/o/${orgId}/d/${sourceId}/povtaryay`, {
    name: 'x',
    frequency: 'MONTHLY',
    nextRunOn: today,
  });
  assert.equal(denied.status, 404);

  const page = await (await http.get(owner, `/app/o/${orgId}/d/${sourceId}/povtaryay`)).text();
  assert.match(page, /plashtaniya@roza\.example/, 'адресът идва от документа');
  const res = await http.post(owner, `/app/o/${orgId}/d/${sourceId}/povtaryay`, {
    name: 'Роза — поддръжка',
    frequency: 'MONTHLY',
    nextRunOn: today,
    dueDays: '10',
    sendTo: 'plashtaniya@roza.example',
    lineName: 'Поддръжка за {период}',
  });
  assert.equal(res.headers.get('location'), `/app/o/${orgId}/povtaryashti?ok=created`);
  const template = await prisma.recurringInvoice.findFirstOrThrow({
    where: { organizationId: orgId },
  });
  templateId = template.id;

  assert.equal(await runDueRecurring(at(today)), 1);
  assert.equal(await runDueRecurring(at(today)), 0, 'същия ден — нищо');
  const doc = await prisma.document.findFirstOrThrow({ where: { recurringId: templateId } });
  assert.equal(doc.number, '0000000002');
  assert.equal(doc.issueDate.toISOString().slice(0, 10), today);
  assert.equal(doc.dueDate?.toISOString().slice(0, 10), addDays(today, 10));
  assert.equal(doc.recurringPeriod, today.slice(0, 7));
  const month = new Intl.DateTimeFormat('bg-BG', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${today}T00:00:00Z`),
  );
  assert.ok((doc.ublXml ?? '').includes(`Поддръжка за ${month} ${today.slice(0, 4)}`));
  const after1 = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: templateId } });
  assert.ok(after1.nextRunOn.toISOString().slice(0, 10) > today);
  assert.equal(after1.lastIssuedOn?.toISOString().slice(0, 10), today);

  // Писмото до получателя: PDF + UBL, отговорът — към фирмата.
  const note = await prisma.notification.findFirstOrThrow({ where: { kind: 'document.sent' } });
  assert.equal(note.toEmail, 'plashtaniya@roza.example');
  const mail = await composeDocumentSentMail(note.toEmail, note.payload);
  assert.equal(mail.attachments.length, 2);
  assert.equal(mail.replyTo, 'office@zora.example');

  // Същият период втори път (ръчно върната дата) — уникалната двойка спира втори документ.
  await prisma.recurringInvoice.update({
    where: { id: templateId },
    data: { nextRunOn: new Date(`${today}T00:00:00Z`) },
  });
  assert.equal(await runDueRecurring(at(today)), 0);
  assert.equal(await prisma.document.count({ where: { recurringId: templateId } }), 1);
  const advanced = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: templateId } });
  assert.ok(advanced.nextRunOn.toISOString().slice(0, 10) > today);
});

test('пауза и продължаване; след пауза графикът е от днес, без наваксване', async () => {
  const pause = await http.post(owner, `/app/o/${orgId}/povtaryashti/${templateId}/pause`, {});
  assert.match(pause.headers.get('location') ?? '', /ok=pause/);
  await prisma.recurringInvoice.update({
    where: { id: templateId },
    data: { nextRunOn: new Date(`${addDays(today, -40)}T00:00:00Z`) },
  });
  assert.equal(await runDueRecurring(at(today)), 0, 'на пауза — нищо');
  await http.post(owner, `/app/o/${orgId}/povtaryashti/${templateId}/resume`, {});
  const resumed = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: templateId } });
  assert.equal(resumed.status, 'ACTIVE');
  assert.ok(resumed.nextRunOn.toISOString().slice(0, 10) >= today);
});

test('създателят вече не може да издава → шаблонът спира, грешката е видима', async () => {
  const helper = await prisma.user.create({
    data: { email: 'issuer@example.test', name: 'Издава', passwordHash: 'x' },
  });
  const membership = await prisma.membership.create({
    data: { userId: helper.id, organizationId: orgId, role: 'ISSUER' },
  });
  const t = await prisma.recurringInvoice.create({
    data: {
      organizationId: orgId,
      seriesId,
      name: 'От издаващия',
      template: (await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: templateId } }))
        .template as object,
      frequency: 'QUARTERLY',
      anchorDay: 1,
      nextRunOn: new Date(`${today}T00:00:00Z`),
      createdById: helper.id,
    },
  });
  await prisma.membership.delete({ where: { id: membership.id } });
  assert.equal(await runDueRecurring(at(today)), 0);
  const stopped = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(stopped.status, 'PAUSED');
  assert.equal(stopped.lastError, 'access');
  const list = await (await http.get(owner, `/app/o/${orgId}/povtaryashti`)).text();
  assert.match(list, /създателят вече няма право да издава/);
  // Крайната дата: след нея шаблонът приключва без документ.
  await prisma.recurringInvoice.update({
    where: { id: t.id },
    data: {
      status: 'ACTIVE',
      createdById: (await prisma.membership.findFirstOrThrow({ where: { role: 'OWNER' } })).userId,
      endOn: new Date(`${addDays(today, -1)}T00:00:00Z`),
    },
  });
  await runDueRecurring(at(today));
  assert.equal(
    (await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: t.id } })).status,
    'ENDED',
  );
});

test('плащане по документ: частично → платено; над остатъка — отказ; махане; зрителят не може', async () => {
  const base = `/app/o/${orgId}/d/${sourceId}`;
  const tooMuch = await http.post(owner, `${base}/plashtane`, { amount: '120,01', paidOn: today });
  assert.match(tooMuch.headers.get('location') ?? '', /plashtane=amount/);
  const future = await http.post(owner, `${base}/plashtane`, {
    amount: '10',
    paidOn: addDays(today, 1),
  });
  assert.match(future.headers.get('location') ?? '', /plashtane=date/);
  assert.equal(
    (await http.post(viewer, `${base}/plashtane`, { amount: '10', paidOn: today })).status,
    404,
  );
  await http.post(owner, `${base}/plashtane`, { amount: '50,00', paidOn: today, note: 'в брой' });
  let doc = await prisma.document.findUniqueOrThrow({ where: { id: sourceId } });
  assert.equal(doc.paymentState, 'PARTIAL');
  assert.equal(doc.paidCents, 5000n);
  await http.post(owner, `${base}/plashtane`, { amount: '70.00', paidOn: today });
  doc = await prisma.document.findUniqueOrThrow({ where: { id: sourceId } });
  assert.equal(doc.paymentState, 'PAID');
  assert.equal(doc.paidAt?.toISOString().slice(0, 10), today);
  const page = await (await http.get(owner, base)).text();
  assert.match(page, /платена/);
  const first = await prisma.documentPayment.findFirstOrThrow({
    where: { documentId: sourceId, note: 'в брой' },
  });
  await http.post(owner, `${base}/plashtane/${first.id}/mahni`, {});
  doc = await prisma.document.findUniqueOrThrow({ where: { id: sourceId } });
  assert.equal(doc.paymentState, 'PARTIAL');
  assert.equal(doc.paidAt, null);
  assert.ok(
    await prisma.auditLog.findFirst({
      where: { action: 'document.payment.removed', targetId: sourceId },
    }),
  );
});

test('напомняния: само включени, +3 и +10 дни, по веднъж; платеният не получава', async () => {
  const due = await prisma.document.findFirstOrThrow({ where: { recurringId: templateId } });
  await prisma.document.update({
    where: { id: due.id },
    data: { dueDate: new Date(`${addDays(today, -3)}T00:00:00Z`) },
  });
  assert.equal(await runReminders(at(today)), 0, 'изключени по подразбиране');
  const on = await http.post(owner, `/app/o/${orgId}/napomnyaniya`, { enabled: 'on' });
  assert.match(on.headers.get('location') ?? '', /ok=remindersOn/);
  assert.equal(await runReminders(at(today)), 1);
  assert.equal(await runReminders(at(today)), 0, 'същия ден — не повтаря');
  const note = await prisma.notification.findFirstOrThrow({ where: { kind: 'document.reminder' } });
  assert.equal(note.toEmail, 'plashtaniya@roza.example');
  const mail = await composeReminderMail(note.toEmail, note.payload);
  assert.match(mail.text, /Остатък за плащане: 120,00 EUR/);
  assert.equal(mail.replyTo, 'office@zora.example');

  // Седем дни по-късно — стъпка +10; после нищо.
  const later = at(addDays(today, 7));
  assert.equal(await runReminders(later), 1);
  // След 30 дни: вторият документ е минал и двете стъпки; първият (частично платен, падеж +14) е
  // просрочен с 16 дни — едно писмо (стъпка 10), а +3 се отбелязва без писмо.
  const before30 = await prisma.notification.count({ where: { kind: 'document.reminder' } });
  assert.equal(await runReminders(at(addDays(today, 30))), 1);
  assert.equal(
    await prisma.notification.count({ where: { kind: 'document.reminder' } }),
    before30 + 1,
  );
  assert.deepEqual(
    (
      await prisma.paymentReminder.findMany({
        where: { documentId: sourceId },
        orderBy: { step: 'asc' },
      })
    ).map((r) => r.step),
    [3, 10],
  );
  assert.equal(await runReminders(at(addDays(today, 31))), 0);
  assert.deepEqual(
    (
      await prisma.paymentReminder.findMany({
        where: { documentId: due.id },
        orderBy: { step: 'asc' },
      })
    ).map((r) => r.step),
    [3, 10],
  );

  // Платен документ — без напомняне, а вече чакащото писмо се отказва.
  await http.post(owner, `/app/o/${orgId}/d/${due.id}/plashtane`, { amount: '120', paidOn: today });
  await assert.rejects(composeReminderMail(note.toEmail, note.payload), /платен/);
});
