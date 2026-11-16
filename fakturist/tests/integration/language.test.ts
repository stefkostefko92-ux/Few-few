import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
process.env['REGISTRATION_OPEN'] = 'true';
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { processOutbox } = await import('../../src/mail/outbox.js');
const { composeOrgMail } = await import('../../src/mail/org-mail.js');
const { composeMasterMail } = await import('../../src/mail/master-mail.js');
const { DEFAULT_SERIES_NAME } = await import('../../src/system-text.js');
type Message = import('../../src/mail/mailer.js').MailMessage;

/**
 * Езикът на приложението (собственикът, 16.11.2026: „пак си се насрал с езиците“): превключвателят BG/EN
 * пази езика в профила; гостът го пази в адреса през формите; регистрацията и поканите го наследяват от
 * страницата; връзката от писмо се отваря на езика на профила; писмата до човек са на неговия език.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const CYRILLIC = /[А-Яа-яЁё]/;
let http: HttpClient;
let bgOwner: Session;
let bgUserId = '';
let bgOrgId = '';
let enUserId = '';

const base = {
  password: PASSWORD,
  acceptTerms: 'on' as const,
  addressStreet: '1 Vitosha Blvd',
  addressCity: 'Sofia',
  postalCode: '1000',
};

const htmlLang = async (res: Response) => /<html lang="([a-z]+)"/.exec(await res.text())?.[1];

async function sendAll(): Promise<Message[]> {
  const sent: Message[] = [];
  await processOutbox(async (message) => {
    sent.push(message);
  });
  return sent;
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  ({ userId: bgUserId, organizationId: bgOrgId } = await register({
    ...base,
    kind: 'company',
    name: 'Иван Петров',
    email: 'bg@example.test',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    vatNumber: 'BG131063188',
  }));
  ({ userId: enUserId } = await register(
    {
      ...base,
      kind: 'company',
      name: 'John Smith',
      email: 'en@example.test',
      legalName: 'Zlato Mill OOD',
      eik: '175074752',
    },
    'en',
  ));
  http = await startHttp(createServer);
  bgOwner = await http.login('bg@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('превключвателят сменя езика в профила и връща на същата страница', async () => {
  assert.equal(await htmlLang(await http.get(bgOwner, '/app')), 'bg');
  const res = await http.post(bgOwner, '/app/ezik', { lang: 'en', back: '/app/sigurnost' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/app/sigurnost');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: bgUserId } });
  assert.equal(user.locale, 'en');
  const page = await http.get(bgOwner, '/app/sigurnost');
  const html = await page.text();
  assert.match(html, /<html lang="en"/);
  // Активният език е маркиран (атрибутът не е екраниран).
  assert.match(html, /value="en" lang="en" aria-label="English" aria-current="true"/);
  await http.post(bgOwner, '/app/ezik', { lang: 'bg', back: '/app' });
  assert.equal(await htmlLang(await http.get(bgOwner, '/app')), 'bg');
});

test('превключвателят: чужд адрес за връщане → /app; непознат език → 400; без вход → вход', async () => {
  for (const back of ['//evil.example/app', 'https://evil.example/app', '/app/../admin', '/vhod']) {
    const res = await http.post(bgOwner, '/app/ezik', { lang: 'bg', back });
    assert.equal(res.headers.get('location'), '/app', back);
  }
  assert.equal((await http.post(bgOwner, '/app/ezik', { lang: 'fr' })).status, 400);
  const guest = await http.post(null, '/app/ezik', { lang: 'en' });
  assert.equal(guest.status, 303);
  assert.equal(guest.headers.get('location'), '/vhod');
});

test('гост: формите пазят езика — грешният вход на /vhod?lang=en е на английски', async () => {
  const login = await http.get(null, '/vhod?lang=en');
  const page = await login.text();
  assert.match(page, /action="\/vhod\?lang=en"/);
  assert.match(page, /href="\/registraciya\?lang=en"/);
  const wrong = await http.post(null, '/vhod?lang=en', {
    email: 'nobody@example.test',
    password: 'грешна-парола-123',
  });
  assert.equal(wrong.status, 400);
  const html = await wrong.text();
  assert.match(html, /<html lang="en"/);
  assert.match(html, /Wrong email or password/);
  assert.equal(await htmlLang(await http.get(null, '/vhod')), 'bg');
});

test('регистрацията на английски дава профил на английски', async () => {
  const res = await http.post(null, '/registraciya?lang=en', {
    kind: 'company',
    name: 'Anna Lee',
    email: 'anna@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Sunrise Trading EOOD',
    eik: '831642181',
    addressStreet: '3 Rakovski St',
    addressCity: 'Plovdiv',
    postalCode: '4000',
  });
  assert.equal(res.status, 303);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'anna@example.test' } });
  assert.equal(user.locale, 'en');
});

test('нова парола по връзката — писмото и страницата на езика на профила', async () => {
  await sendAll();
  const ask = await http.post(null, '/zabravena-parola', { email: 'en@example.test' });
  assert.equal(ask.status, 200);
  let mail: Message | undefined;
  for (let i = 0; i < 50 && !mail; i += 1) {
    mail = (await sendAll()).find((m) => m.to === 'en@example.test');
    if (!mail) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(mail, 'писмо за нова парола');
  assert.equal(mail.subject, 'New password for Fakturist');
  const path = /\/nova-parola\/[A-Za-z0-9_-]{43}/.exec(mail.text)?.[0] ?? '';
  assert.ok(path);
  assert.equal(await htmlLang(await http.get(null, path)), 'en');
  assert.equal(await htmlLang(await http.get(null, `${path}?lang=bg`)), 'bg');
  const done = await http.post(null, path, { password: 'нова-дълга-парола-за-теста-2026' });
  assert.equal(done.status, 303);
  assert.equal(done.headers.get('location'), '/vhod?ok=reset&lang=en');
});

test('писмата до човек са на езика на профила му', async () => {
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: enUserId } })).locale, 'en');
  const terminated = await composeOrgMail('org.terminated', 'en@example.test', {
    legalName: 'Zlato Mill OOD',
    purgeAfter: '2026-12-16T10:00:00.000Z',
  });
  assert.equal(terminated.subject, 'Fakturist — “Zlato Mill OOD” is terminated');
  for (const part of [terminated.subject, terminated.text, terminated.html]) {
    assert.ok(!CYRILLIC.test(part), part.slice(0, 200));
  }
  assert.match(terminated.html, /<html lang="en"/);
  const notice = await composeMasterMail('master.notice', 'en@example.test', {
    action: 'granted',
    email: 'new@example.test',
  });
  assert.ok(!CYRILLIC.test(notice.subject + notice.text), notice.text);
  // Български профил — както досега.
  const bg = await composeOrgMail('org.purged', 'bg@example.test', {
    legalName: 'Пекарна Зора ЕООД',
  });
  assert.match(bg.subject, /данните на „Пекарна Зора ЕООД“ са изтрити/);
  assert.match(bg.text, /^Здравейте,/);
});

test('началната серия: „Main“ на английски; непроменено име не я преименува', async () => {
  const series = await prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: bgOrgId },
  });
  assert.equal(series.name, DEFAULT_SERIES_NAME);
  await http.post(bgOwner, '/app/ezik', { lang: 'en', back: '/app' });
  const page = await (await http.get(bgOwner, `/app/o/${bgOrgId}/serii`)).text();
  assert.match(page, /<h2 id="s-[^"]+">Main </);
  assert.ok(!page.includes(DEFAULT_SERIES_NAME));
  const fields = {
    rangeStart: String(series.rangeStart),
    rangeEnd: String(series.rangeEnd),
  };
  const same = await http.post(bgOwner, `/app/o/${bgOrgId}/serii/${series.id}`, {
    name: 'Main',
    ...fields,
  });
  assert.equal(same.status, 303);
  assert.equal(
    (await prisma.documentSeries.findUniqueOrThrow({ where: { id: series.id } })).name,
    DEFAULT_SERIES_NAME,
  );
  await http.post(bgOwner, `/app/o/${bgOrgId}/serii/${series.id}`, {
    name: 'Main 2026',
    ...fields,
  });
  assert.equal(
    (await prisma.documentSeries.findUniqueOrThrow({ where: { id: series.id } })).name,
    'Main 2026',
  );
  await http.post(bgOwner, '/app/ezik', { lang: 'bg', back: '/app' });
});
