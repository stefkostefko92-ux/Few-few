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

/** Прегледът от 16.11.2026: проверката на текущата парола в „Сигурност“ има таван (10 за 15 мин на профил). */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  });
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('смяната на паролата: след 10 опита за 15 минути — „твърде много опити“, паролата не се проверява', async () => {
  const attempt = () =>
    http.post(owner, '/app/sigurnost/parola', {
      current: 'грешна-парола-за-опита',
      password: 'нова-много-дълга-парола-2026',
    });
  for (let i = 0; i < 10; i += 1) {
    const res = await attempt();
    assert.equal(res.status, 303);
    assert.doesNotMatch(res.headers.get('location') ?? '', /rateLimited/);
  }
  const limited = await attempt();
  assert.equal(limited.status, 303);
  assert.equal(limited.headers.get('location'), '/app/sigurnost?err=rateLimited');
  const page = await (await http.get(owner, '/app/sigurnost?err=rateLimited')).text();
  assert.match(page, /Твърде много опити с паролата/);
});
