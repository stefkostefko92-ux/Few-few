import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Prisma } from '@prisma/client';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { inviteMember } = await import('../../src/accounts/members.js');
const { createApiKey } = await import('../../src/api/keys.js');
const { invalidateSettings } = await import('../../src/admin/settings.js');
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { encryptTotpSecret } = await import('../../src/auth/keys.js');
const { sofiaToday, DAY } = await import('../../src/time.js');
const { requestTermination, cancelTermination, TerminationError, TERMINATION_GRACE_MS } =
  await import('../../src/accounts/termination.js');
const { purgeTerminated, KEPT_AFTER_PURGE } =
  await import('../../src/accounts/termination-purge.js');
const { runReminders } = await import('../../src/documents/reminders.js');
const { createTransferInvite, TransferError } = await import('../../src/accounts/transfer.js');

/**
 * Прекратяване на фирма (SPEC 65–67; общите условия т. 11, договорът за обработване т. 11): заявка →
 * 30 дни само преглед и изтегляне → изтриване на всичко, освен надгробието и списъка за пазене.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const today = sofiaToday();
let http: HttpClient;
let owner: Session;
const ids = {
  a: '',
  aOwner: '',
  b: '',
  bOwner: '',
  firm: '',
  supplier: '',
  master: '',
  client: '',
};
let masterSecret = '';
let deliveredNumber = '';
let replacementNumber = '';

const base = {
  password: PASSWORD,
  acceptTerms: 'on' as const,
  addressStreet: 'ул. „Раковски“ 2',
  addressCity: 'Перник',
  postalCode: '2300',
};

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const a = await register({
    ...base,
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    vatNumber: 'BG131063188',
  });
  const b = await register({
    ...base,
    kind: 'company',
    name: 'Роза Иванова',
    email: 'roza@example.test',
    legalName: 'Сладкарница Роза ЕООД',
    eik: '121604974',
    vatNumber: 'BG121604974',
  });
  const firm = await register({
    ...base,
    kind: 'accountant',
    name: 'Цвета Колева',
    email: 'firm@example.test',
    legalName: 'Кантора Баланс ООД',
    eik: '175074752',
  });
  const supplier = await register({
    ...base,
    kind: 'company',
    name: 'Карбон Стелт',
    email: 'billing@example.test',
    legalName: 'Карбон Стелт ЕДПК',
    eik: '200000027',
  });
  Object.assign(ids, {
    a: a.organizationId,
    aOwner: a.userId,
    b: b.organizationId,
    bOwner: b.userId,
    firm: firm.organizationId,
    supplier: supplier.organizationId,
  });
  // Шкафчето доставя само към потвърдена фирма.
  await prisma.organization.update({ where: { id: ids.b }, data: { verifiedAt: new Date() } });
  await prisma.subscription.updateMany({
    where: { organizationId: ids.a },
    data: { planCode: 'business' },
  });
  await prisma.setting.upsert({
    where: { key: 'billing.supplierOrgId' },
    create: { key: 'billing.supplierOrgId', value: ids.supplier },
    update: { value: ids.supplier },
  });
  invalidateSettings();
  masterSecret = generateTotpSecret();
  const master = await prisma.user.create({
    data: {
      email: 'master@example.test',
      name: 'Мастър',
      passwordHash: 'x',
      platformRole: 'MASTER',
    },
  });
  ids.master = master.id;
  await prisma.user.update({
    where: { id: master.id },
    data: { totpSecretEnc: encryptTotpSecret(masterSecret, master.id), totpEnabledAt: new Date() },
  });
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  // Кантората добавя фирма-клиент без собственик.
  const firmSession = await http.login('firm@example.test', PASSWORD);
  const added = await http.post(firmSession, `/app/o/${ids.firm}/klienti/nov`, {
    legalName: 'Клиент Без Собственик ЕООД',
    eik: '200000015',
    addressStreet: 'ул. „Самуил“ 3',
    addressCity: 'Перник',
    postalCode: '2300',
    documentRef: 'Пълномощно № 1',
    validFrom: '2026-11-01',
    processorDeclaration: 'on',
  });
  assert.equal(added.status, 303);
  ids.client = (await prisma.organization.findUniqueOrThrow({ where: { eik: '200000015' } })).id;
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

const masterCode = async () => {
  await prisma.user.update({ where: { id: ids.master }, data: { totpLastStep: null } });
  return totpCodeAt(masterSecret, totpStep(Math.floor(Date.now() / 1000)));
};
const isCode = (code: string) => (error: unknown) =>
  error instanceof TerminationError && error.code === code;
const ownerActor = () => ({ userId: ids.aOwner, master: false });

async function issueToB(extra: Record<string, string> = {}): Promise<Response> {
  const seriesId = (
    await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: ids.a } })
  ).id;
  return http.post(owner, `/app/o/${ids.a}/nov`, {
    typeCode: '380',
    seriesId,
    issueDate: today,
    taxPointDate: today,
    dueDate: today,
    currency: 'EUR',
    'buyer[name]': 'Сладкарница Роза ЕООД',
    'buyer[legalId]': '121604974',
    'buyer[email]': 'roza@example.test',
    'buyer[street]': 'ул. „Шипка“ 1',
    'buyer[city]': 'София',
    'buyer[postalCode]': '1000',
    'buyer[countryCode]': 'BG',
    'lines[0][name]': 'Хляб',
    'lines[0][quantity]': '10',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '1.25',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
    ...extra,
  });
}

test('собственикът прекратява с паролата: 30 дни, отменени покани, оттеглени ключове, пауза, писмо', async () => {
  // Документ до потвърдена фирма — в шкафчето ѝ; след изтриването трябва да остане при нея.
  assert.equal((await issueToB()).status, 303);
  const delivered = await prisma.document.findFirstOrThrow({ where: { organizationId: ids.a } });
  deliveredNumber = delivered.number!;
  assert.equal(await prisma.inboxEntry.count({ where: { recipientOrgId: ids.b } }), 1);

  const access = {
    organizationId: ids.a,
    role: 'OWNER' as const,
    viaFirmId: null,
    mandateId: null,
  };
  await inviteMember({
    organizationId: ids.a,
    actor: { userId: ids.aOwner, role: 'OWNER' },
    email: 'chlen@example.test',
    role: 'ISSUER',
  });
  await createApiKey(access, ids.aOwner, { name: 'Счетоводна програма', scopes: ['read'] });
  await prisma.recurringInvoice.create({
    data: {
      organizationId: ids.a,
      seriesId: delivered.seriesId!,
      sourceDocumentId: delivered.id,
      name: 'Месечен абонамент',
      template: {},
      frequency: 'MONTHLY',
      anchorDay: 1,
      nextRunOn: new Date('2026-12-01T00:00:00Z'),
      createdById: ids.aOwner,
    },
  });

  await assert.rejects(
    requestTermination({
      organizationId: ids.a,
      actor: ownerActor(),
      password: 'грешна-парола-1234',
    }),
    isCode('password'),
  );
  assert.equal(
    (await prisma.organization.findUniqueOrThrow({ where: { id: ids.a } })).terminatedAt,
    null,
  );

  const { purgeAfter } = await requestTermination({
    organizationId: ids.a,
    actor: ownerActor(),
    password: PASSWORD,
  });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ids.a } });
  assert.ok(org.terminatedAt);
  assert.equal(org.purgeAfter?.getTime(), purgeAfter.getTime());
  assert.equal(purgeAfter.getTime() - org.terminatedAt.getTime(), TERMINATION_GRACE_MS);
  assert.equal(TERMINATION_GRACE_MS, 30 * DAY);
  assert.equal(
    await prisma.memberInvite.count({ where: { organizationId: ids.a, revokedAt: null } }),
    0,
  );
  assert.equal(await prisma.apiKey.count({ where: { organizationId: ids.a, revokedAt: null } }), 0);
  assert.equal(
    await prisma.recurringInvoice.count({ where: { organizationId: ids.a, status: 'ACTIVE' } }),
    0,
  );
  const mail = await prisma.notification.findFirstOrThrow({ where: { kind: 'org.terminated' } });
  assert.equal(mail.toEmail, 'owner@example.test');
  assert.equal(await prisma.auditLog.count({ where: { action: 'org.terminated' } }), 1);
  await assert.rejects(
    requestTermination({ organizationId: ids.a, actor: ownerActor(), password: PASSWORD }),
    isCode('already'),
  );
});

test('до изтриването: преглед и архив — да; запис — 409; шкафчето не доставя към прекратена', async () => {
  const page = await http.get(owner, `/app/o/${ids.a}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Фирмата е прекратена/);
  const write = await issueToB();
  assert.equal(write.status, 409);
  assert.match(await write.text(), /Фирмата е прекратена/);
  const archive = await http.get(owner, `/app/o/${ids.a}/iznos.zip`);
  assert.equal(archive.status, 200);
  assert.equal(archive.headers.get('content-type'), 'application/zip');

  // Роза издава към Зора — прекратената не получава в шкафчето.
  const rozaSession = await http.login('roza@example.test', PASSWORD);
  const seriesId = (
    await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: ids.b } })
  ).id;
  const sent = await http.post(rozaSession, `/app/o/${ids.b}/nov`, {
    typeCode: '380',
    seriesId,
    issueDate: today,
    taxPointDate: today,
    dueDate: today,
    currency: 'EUR',
    'buyer[name]': 'Пекарна Зора ЕООД',
    'buyer[legalId]': '131063188',
    'buyer[street]': 'ул. „Раковски“ 2',
    'buyer[city]': 'Перник',
    'buyer[postalCode]': '2300',
    'buyer[countryCode]': 'BG',
    'lines[0][name]': 'Торта',
    'lines[0][quantity]': '1',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '30.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
  });
  assert.equal(sent.status, 303);
  assert.equal(await prisma.inboxEntry.count({ where: { recipientOrgId: ids.a } }), 0);
});

test('отмяна — собственикът с паролата, до срока; после прекратява пак', async () => {
  await assert.rejects(
    cancelTermination({
      organizationId: ids.a,
      actor: ownerActor(),
      password: 'грешна-парола-1234',
    }),
    isCode('password'),
  );
  await cancelTermination({ organizationId: ids.a, actor: ownerActor(), password: PASSWORD });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ids.a } });
  assert.equal(org.terminatedAt, null);
  assert.equal(org.purgeAfter, null);
  assert.equal((await issueToB()).status, 303, 'издава отново');
  // „Анулирай и издай нов“ на доставения до Роза: при изтриването анулираният не става неин входящ.
  const delivered = await prisma.document.findFirstOrThrow({
    where: { organizationId: ids.a, number: deliveredNumber },
  });
  const replaced = await issueToB({ replaces: delivered.id, annulReason: 'requisite' });
  assert.equal(replaced.status, 303);
  replacementNumber = (
    await prisma.document.findFirstOrThrow({
      where: { organizationId: ids.a, status: 'ISSUED' },
      orderBy: { createdAt: 'desc' },
    })
  ).number!;
  await assert.rejects(
    cancelTermination({ organizationId: ids.a, actor: ownerActor(), password: PASSWORD }),
    isCode('notTerminated'),
  );
  await requestTermination({ organizationId: ids.a, actor: ownerActor(), password: PASSWORD });
});

test('откази: доставчикът на плановете, кантора с клиент без собственик, чужд човек, грешен 2FA код', async () => {
  await assert.rejects(
    requestTermination({
      organizationId: ids.supplier,
      actor: { userId: ids.master, master: true },
      code: await masterCode(),
    }),
    isCode('supplier'),
  );
  const firmOwner = (await prisma.user.findUniqueOrThrow({ where: { email: 'firm@example.test' } }))
    .id;
  await assert.rejects(
    requestTermination({
      organizationId: ids.firm,
      actor: { userId: firmOwner, master: false },
      password: PASSWORD,
    }),
    isCode('ownerlessClients'),
  );
  await assert.rejects(
    requestTermination({
      organizationId: ids.b,
      actor: { userId: ids.aOwner, master: false },
      password: PASSWORD,
    }),
    isCode('notOwner'),
  );
  await assert.rejects(
    requestTermination({
      organizationId: ids.client,
      actor: { userId: ids.master, master: true },
      code: '000000',
    }),
    isCode('code'),
  );
  // Мастърът прекратява фирмата без собственик; после кантората вече може.
  await requestTermination({
    organizationId: ids.client,
    actor: { userId: ids.master, master: true },
    code: await masterCode(),
  });
  await requestTermination({
    organizationId: ids.firm,
    actor: { userId: firmOwner, master: false },
    password: PASSWORD,
  });
  await cancelTermination({
    organizationId: ids.firm,
    actor: { userId: ids.master, master: true },
    code: await masterCode(),
  });
});

test('прекратена фирма: без напомняния от нейно име и без покана за собственик', async () => {
  // Зора е прекратена; напомнянията ѝ са включени и има просрочен документ с имейл на получателя.
  await prisma.organization.update({ where: { id: ids.a }, data: { remindersEnabled: true } });
  await prisma.document.updateMany({
    where: { organizationId: ids.a, status: 'ISSUED' },
    data: { dueDate: new Date('2026-01-01T00:00:00Z') },
  });
  const sent = await runReminders(new Date());
  assert.equal(sent, 0);
  assert.equal(await prisma.notification.count({ where: { kind: 'document.reminder' } }), 0);
  // Фирма-клиент, прекратена от мастъра: нов собственик би отменил прекратяването.
  await assert.rejects(
    createTransferInvite({
      organizationId: ids.client,
      email: 'nov-sobstvenik@example.test',
      actorId: ids.master,
    }),
    (error: unknown) => error instanceof TransferError && error.code === 'notFound',
  );
});

/** Всяко поле към Organization във всеки модел (по схемата) — за проверката „нищо не остава“. */
function organizationReferences(): Array<{ model: string; field: string }> {
  const refs: Array<{ model: string; field: string }> = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (field.type === 'Organization' && field.relationFromFields?.length) {
        refs.push({ model: model.name, field: field.relationFromFields[0]! });
      }
    }
  }
  return refs;
}

type CountDelegate = { count(args: { where: Record<string, string> }): Promise<number> };

test('след 30 дни: доставените — при получателя; всичко друго е изтрито; ЕИК е свободен', async () => {
  assert.deepEqual(await purgeTerminated(new Date()), { purged: 0, archived: 0 });
  // Решенията на Роза върху доставения остават в копието: отказан не влиза в дневника ѝ за покупките.
  await prisma.inboxEntry.updateMany({
    where: { recipientOrgId: ids.b, document: { number: replacementNumber } },
    data: { status: 'REJECTED', vatCredit: 'PARTIAL', journalPeriod: '2026-12' },
  });
  const result = await purgeTerminated(new Date(Date.now() + 31 * DAY));
  assert.equal(result.purged, 2, 'Зора и фирмата без собственик');
  assert.ok(result.archived >= 1);

  // Документът, доставен на Роза, е вече в нейните „Входящи“ — XML-ът, както е издаден.
  const kept = await prisma.incomingInvoice.findFirstOrThrow({
    where: { organizationId: ids.b, number: replacementNumber },
  });
  assert.equal(
    await prisma.incomingInvoice.count({
      where: { organizationId: ids.b, number: deliveredNumber },
    }),
    0,
    'анулираният не става валиден входящ',
  );
  assert.equal(kept.source, 'INBOX');
  assert.equal(kept.status, 'REJECTED');
  assert.equal(kept.vatCredit, 'PARTIAL');
  assert.equal(kept.journalPeriod, '2026-12');
  assert.match(kept.xml, /<cbc:ID>/);

  const delegates = prisma as unknown as Record<string, CountDelegate>;
  for (const { model, field } of organizationReferences()) {
    const key = `${model}.${field}`;
    if ((KEPT_AFTER_PURGE as readonly string[]).includes(key)) continue;
    const delegate = delegates[model.charAt(0).toLowerCase() + model.slice(1)]!;
    assert.equal(await delegate.count({ where: { [field]: ids.a } }), 0, key);
  }
  const tomb = await prisma.organization.findUniqueOrThrow({ where: { id: ids.a } });
  assert.ok(tomb.deletedAt);
  assert.equal(tomb.legalName, 'Пекарна Зора ЕООД');
  assert.equal(tomb.eik, null);
  assert.equal(tomb.vatNumber, null);
  assert.equal(tomb.email, null);
  assert.equal(tomb.iban, null);

  assert.equal((await http.get(owner, `/app/o/${ids.a}`)).status, 404);
  const purgedMail = await prisma.notification.findFirstOrThrow({ where: { kind: 'org.purged' } });
  assert.equal(purgedMail.toEmail, 'owner@example.test');
  // Приетите условия и одитът остават.
  assert.ok((await prisma.legalAcceptance.count({ where: { organizationId: ids.a } })) > 0);
  assert.ok((await prisma.auditLog.count({ where: { organizationId: ids.a } })) > 0);

  // Същият ЕИК — нова регистрация.
  const again = await register({
    ...base,
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner2@example.test',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
  });
  assert.notEqual(again.organizationId, ids.a);
  // Втори проход — нищо за правене.
  assert.equal((await purgeTerminated(new Date(Date.now() + 40 * DAY))).purged, 0);
});
