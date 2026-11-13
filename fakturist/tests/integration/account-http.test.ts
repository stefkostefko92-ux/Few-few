import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { processOutbox } = await import('../../src/mail/outbox.js');
const { createServer } = await import('../../src/server.js');
const { verifyPassword } = await import('../../src/auth/password.js');
type Message = import('../../src/mail/mailer.js').MailMessage;

/**
 * SPEC 36–38 през HTTP: страниците „Забравена парола“, „Нова парола“ и потвърждението на имейла —
 * еднакъв отговор, `no-store`/`no-referrer` на страниците с токен, еднократни връзки.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
let server: Server;
let origin = '';
let userId = '';

async function sendAll(): Promise<Message[]> {
  const sent: Message[] = [];
  await processOutbox(async (message) => {
    sent.push(message);
  });
  return sent;
}

function linkFrom(message: Message, path: string): string {
  const match = new RegExp(`${path}/[A-Za-z0-9_-]{43}`).exec(message.text);
  assert.ok(match, `няма връзка ${path} в писмото`);
  return match[0];
}

/** Работата след отговора на „Забравена парола“ е във фонов режим — чакаме писмото в опашката. */
async function waitForQueued(kind: string, toEmail: string): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if ((await prisma.notification.count({ where: { kind, toEmail, status: 'PENDING' } })) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`няма писмо ${kind}`);
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  ({ userId } = await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'ivan@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  }));
  server = createServer().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('потвърждение на имейла по връзката от писмото — веднъж', async () => {
  const mail = (await sendAll()).find((m) => m.to === 'ivan@example.test');
  assert.ok(mail);
  const path = linkFrom(mail, '/potvardi-imeyl');
  const first = await fetch(`${origin}${path}`);
  assert.equal(first.status, 200);
  assert.ok(first.headers.get('cache-control')?.includes('no-store'));
  assert.equal(first.headers.get('referrer-policy'), 'no-referrer');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.ok(user.emailVerifiedAt);
  // Второ отваряне (скенерът на пощата е бил пръв) — пак „потвърден“.
  const again = await fetch(`${origin}${path}`);
  assert.equal(again.status, 200);
  assert.ok((await again.text()).includes('Имейлът е потвърден'));
});

test('„Забравена парола“: един и същ отговор за познат и непознат имейл', async () => {
  const ask = (email: string) =>
    fetch(`${origin}/zabravena-parola`, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ email }),
    });
  const known = await ask('ivan@example.test');
  const unknown = await ask('nobody@example.test');
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  const strip = (html: string, email: string) => html.replaceAll(email, '<имейл>');
  assert.equal(
    strip(await known.text(), 'ivan@example.test'),
    strip(await unknown.text(), 'nobody@example.test'),
  );
  await waitForQueued('account.passwordReset', 'ivan@example.test');
  assert.equal(await prisma.notification.count({ where: { toEmail: 'nobody@example.test' } }), 0);
});

test('„Нова парола“: слаба — 400 и връзката остава; добра — вход с нея; втори път — 404', async () => {
  const mail = (await sendAll()).find((m) => m.subject.includes('Нова парола'));
  assert.ok(mail);
  const path = linkFrom(mail, '/nova-parola');
  const page = await fetch(`${origin}${path}`);
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('cache-control')?.includes('no-store'));
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.ok((await page.text()).includes('ivan@example.test'));

  const weak = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: FORM,
    body: new URLSearchParams({ password: 'къса' }),
  });
  assert.equal(weak.status, 400);

  const done = await fetch(`${origin}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: FORM,
    body: new URLSearchParams({ password: 'съвсем-нова-парола-2026' }),
  });
  assert.equal(done.status, 303);
  assert.equal(done.headers.get('location'), '/vhod?ok=reset');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.ok(await verifyPassword('съвсем-нова-парола-2026', user.passwordHash));
  assert.equal((await fetch(`${origin}${path}`)).status, 404);

  const login = await fetch(`${origin}/vhod?ok=reset`);
  assert.ok((await login.text()).includes('Паролата е сменена'));
});

test('чужд Origin не минава към формите без вход', async () => {
  const response = await fetch(`${origin}/zabravena-parola`, {
    method: 'POST',
    headers: { ...FORM, origin: 'https://evil.example' },
    body: new URLSearchParams({ email: 'ivan@example.test' }),
  });
  assert.equal(response.status, 403);
});
