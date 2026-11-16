import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { composeProformaSentMail } = await import('../../src/proforma/mail.js');
const { sofiaToday } = await import('../../src/time.js');
const { addDays } = await import('../../src/recurring/schedule.js');

/**
 * Проформа фактура (решение на собственика, 13.11.2026): не е данъчен документ — своя номерация
 * „ПФ-…“ без пропуски, серията на фактурите не мърда, извън веригата; „Издай фактура“ я свързва с
 * фактурата веднъж; отказ; писмо с PDF; права.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let viewer: Session;
let orgId = '';
let seriesId = '';
const today = sofiaToday();

function form(extra: Record<string, string> = {}): Record<string, string> {
  return {
    typeCode: 'proforma',
    seriesId,
    issueDate: today,
    taxPointDate: today,
    dueDate: addDays(today, 7),
    currency: 'EUR',
    'buyer[name]': 'Сладкарница Роза ЕООД',
    'buyer[legalId]': '121604974',
    'buyer[street]': 'ул. „Шипка“ 1',
    'buyer[city]': 'София',
    'buyer[postalCode]': '1000',
    'buyer[countryCode]': 'BG',
    'buyer[email]': 'Plashtaniya@Roza.example',
    pdfLanguage: 'bg-en',
    'lines[0][name]': 'Торта по поръчка',
    'lines[0][quantity]': '2',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '45.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
    ...extra,
  };
}

const pdfText = (buffer: Buffer) =>
  execFileSync('pdftotext', ['-layout', '-', '-'], { input: buffer }).toString('utf8');

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
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('проформа: своя номерация, серията на фактурите не мърда, извън веригата; грешка не изгаря номер', async () => {
  const seriesBefore = await prisma.documentSeries.findUniqueOrThrow({ where: { id: seriesId } });
  const bad = await http.post(owner, `/app/o/${orgId}/nov`, form({ 'lines[0][netPrice]': '-5' }));
  assert.equal(bad.status, 400, 'същите проверки като фактурата');
  const first = await http.post(owner, `/app/o/${orgId}/nov`, form());
  assert.equal(first.status, 303);
  assert.match(first.headers.get('location') ?? '', /\/proformi\/[a-z0-9]+\?ok=created$/);
  const second = await http.post(owner, `/app/o/${orgId}/nov`, form());
  assert.equal(second.status, 303);
  const all = await prisma.proforma.findMany({
    where: { organizationId: orgId },
    orderBy: { number: 'asc' },
  });
  assert.deepEqual(
    all.map((p) => p.number),
    ['ПФ-0000000001', 'ПФ-0000000002'],
  );
  assert.equal(all[0]!.status, 'OPEN');
  assert.equal(all[0]!.payableCents, 10800n);
  assert.equal(all[0]!.buyerEmail, 'plashtaniya@roza.example');
  assert.equal(await prisma.document.count({ where: { organizationId: orgId } }), 0);
  const seriesAfter = await prisma.documentSeries.findUniqueOrThrow({ where: { id: seriesId } });
  assert.equal(seriesAfter.nextNumber, seriesBefore.nextNumber, 'серията на фактурите не мърда');
  const audit = await prisma.auditLog.count({ where: { action: 'proforma.created' } });
  assert.equal(audit, 2);
});

test('страница, списък и PDF: „ПРОФОРМА ФАКТУРА“, не е данъчен документ, без звено от веригата', async () => {
  const proforma = await prisma.proforma.findFirstOrThrow({ where: { number: 'ПФ-0000000001' } });
  const list = await (await http.get(viewer, `/app/o/${orgId}/proformi`)).text();
  assert.match(list, /ПФ-0000000001/);
  const page = await (await http.get(viewer, `/app/o/${orgId}/proformi/${proforma.id}`)).text();
  assert.match(page, /не е данъчен документ/);
  assert.doesNotMatch(page, /Издай фактура/, 'само за четене — без бутоните');
  const pdf = await http.get(viewer, `/app/o/${orgId}/proformi/${proforma.id}/proforma.pdf`);
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-disposition') ?? '', /^inline;/);
  const text = pdfText(Buffer.from(await pdf.arrayBuffer()));
  assert.match(text, /ПРОФОРМА ФАКТУРА/);
  assert.match(text, /PRO FORMA INVOICE/, 'двуезичният PDF');
  assert.match(text, /ПФ-0000000001/);
  assert.match(text, /Проформата не е данъчен документ по ЗДДС/);
  assert.doesNotMatch(text, /Дата на данъчното събитие/);
  assert.doesNotMatch(text, /Звено №/);
  assert.match(text, /108,00/);
});

test('„Издай фактура“: формата е попълнена, издаването свързва проформата веднъж', async () => {
  const proforma = await prisma.proforma.findFirstOrThrow({ where: { number: 'ПФ-0000000001' } });
  const prefill = await (
    await http.get(owner, `/app/o/${orgId}/nov?ot-proforma=${proforma.id}`)
  ).text();
  assert.match(prefill, /Сладкарница Роза ЕООД/);
  assert.match(prefill, /Торта по поръчка/);
  assert.match(prefill, new RegExp(`name="fromProforma" value="${proforma.id}"`));
  assert.doesNotMatch(prefill, /<option value="proforma"/, 'от проформа не се прави проформа');
  const invoice = form({ typeCode: '380', fromProforma: proforma.id });
  const issued = await http.post(owner, `/app/o/${orgId}/nov`, invoice);
  assert.equal(issued.status, 303);
  const document = await prisma.document.findFirstOrThrow({ where: { organizationId: orgId } });
  assert.equal(document.number, '0000000001');
  assert.equal(document.typeCode, '380');
  const linked = await prisma.proforma.findUniqueOrThrow({ where: { id: proforma.id } });
  assert.equal(linked.status, 'INVOICED');
  assert.equal(linked.invoiceDocumentId, document.id);
  const docPage = await (await http.get(owner, `/app/o/${orgId}/d/${document.id}`)).text();
  assert.match(docPage, /ПФ-0000000001/);

  // Втори опит (двоен клик): отказ, номерът на фактурата не изгаря.
  const again = await http.post(owner, `/app/o/${orgId}/nov`, invoice);
  assert.equal(again.status, 400);
  assert.match(await again.text(), /вече е фактурирана или отказана/);
  assert.equal(await prisma.document.count({ where: { organizationId: orgId } }), 1);
  const series = await prisma.documentSeries.findUniqueOrThrow({ where: { id: seriesId } });
  assert.equal(series.nextNumber, 2n);
  assert.equal(
    (await http.get(owner, `/app/o/${orgId}/nov?ot-proforma=${proforma.id}`)).status,
    404,
  );
  // Известие (381) не може да е „от проформа“.
  const other = await prisma.proforma.findFirstOrThrow({ where: { number: 'ПФ-0000000002' } });
  const credit = await http.post(
    owner,
    `/app/o/${orgId}/nov`,
    form({
      typeCode: '381',
      fromProforma: other.id,
      'preceding[number]': '0000000001',
      'preceding[issueDate]': today,
    }),
  );
  assert.equal(credit.status, 400);
  assert.equal(
    (await prisma.proforma.findUniqueOrThrow({ where: { id: other.id } })).status,
    'OPEN',
  );
});

test('писмо с PDF до получателя; отказ; отказана не се фактурира и не се праща', async () => {
  const proforma = await prisma.proforma.findFirstOrThrow({ where: { number: 'ПФ-0000000002' } });
  const sent = await http.post(owner, `/app/o/${orgId}/proformi/${proforma.id}/izprati`, {
    email: 'Plashtaniya@Roza.example',
  });
  assert.match(sent.headers.get('location') ?? '', /ok=sent$/);
  const mail = await prisma.notification.findFirstOrThrow({ where: { kind: 'proforma.sent' } });
  assert.equal(mail.toEmail, 'plashtaniya@roza.example');
  const message = await composeProformaSentMail(mail.toEmail, mail.payload);
  assert.match(message.subject, /Проформа фактура № ПФ-0000000002 от Пекарна Зора ЕООД/);
  assert.equal(message.replyTo, 'office@zora.example');
  assert.equal(message.attachments.length, 1);
  assert.equal(message.attachments[0]!.contentType, 'application/pdf');
  const bad = await http.post(owner, `/app/o/${orgId}/proformi/${proforma.id}/izprati`, {
    email: 'не-е-имейл',
  });
  assert.match(bad.headers.get('location') ?? '', /err=noEmail$/);

  // Само за четене: нито писмо, нито отказ.
  assert.equal(
    (await http.post(viewer, `/app/o/${orgId}/proformi/${proforma.id}/otkazhi`, {})).status,
    404,
  );
  const cancelled = await http.post(owner, `/app/o/${orgId}/proformi/${proforma.id}/otkazhi`, {});
  assert.match(cancelled.headers.get('location') ?? '', /ok=cancelled$/);
  assert.equal(
    (await prisma.proforma.findUniqueOrThrow({ where: { id: proforma.id } })).status,
    'CANCELLED',
  );
  await assert.rejects(composeProformaSentMail(mail.toEmail, mail.payload), /не е отворена/);
  const again = await http.post(owner, `/app/o/${orgId}/proformi/${proforma.id}/izprati`, {
    email: 'plashtaniya@roza.example',
  });
  assert.match(again.headers.get('location') ?? '', /err=notOpen$/);
  const invoice = await http.post(
    owner,
    `/app/o/${orgId}/nov`,
    form({ typeCode: '380', fromProforma: proforma.id }),
  );
  assert.equal(invoice.status, 400);
});

test('чужда фирма не вижда проформата; само за четене не създава', async () => {
  const proforma = await prisma.proforma.findFirstOrThrow({ where: { number: 'ПФ-0000000001' } });
  await register({
    kind: 'company',
    name: 'Мария Иванова',
    email: 'other@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Друга фирма ЕООД',
    eik: '121604974',
    addressStreet: 'ул. „Шипка“ 1',
    addressCity: 'София',
    postalCode: '1000',
  });
  const stranger = await http.login('other@example.test', PASSWORD);
  assert.equal((await http.get(stranger, `/app/o/${orgId}/proformi/${proforma.id}`)).status, 404);
  assert.equal(
    (await http.get(stranger, `/app/o/${orgId}/proformi/${proforma.id}/proforma.pdf`)).status,
    404,
  );
  assert.equal((await http.post(viewer, `/app/o/${orgId}/nov`, form())).status, 404);
  assert.equal(await prisma.proforma.count({ where: { organizationId: orgId } }), 2);
});
