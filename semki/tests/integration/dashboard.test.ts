import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import {
  CHANNEL,
  cookieHeader,
  cookieJar,
  csrfFrom,
  fakeGuild,
  fakeSender,
  login,
  ROLE,
  startApp,
  USER_ID,
  type FakeGuild,
  type SentMessage,
} from '../helpers.js';
import { prepareDb, resetDb } from './db.js';

let db: PrismaClient;
let guild: FakeGuild;
const sent: SentMessage[] = [];
let app: Awaited<ReturnType<typeof startApp>>;

before(async () => {
  db = prepareDb();
});
after(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb(db);
  sent.length = 0;
  guild = fakeGuild();
});

async function withApp(fn: () => Promise<void>) {
  app = await startApp({ db, guild, sender: fakeSender(sent) });
  try {
    await fn();
  } finally {
    await app.close();
  }
}

async function page(jar: Map<string, string>, path: string) {
  const res = await fetch(`${app.url}${path}`, {
    headers: { cookie: cookieHeader(jar) },
    redirect: 'manual',
  });
  cookieJar(res, jar);
  return { res, html: await res.text() };
}

async function post(jar: Map<string, string>, path: string, fields: Record<string, string>) {
  const { html } = await page(jar, '/');
  const body = new URLSearchParams({ _csrf: csrfFrom(html), ...fields });
  const res = await fetch(`${app.url}${path}`, {
    method: 'POST',
    headers: { cookie: cookieHeader(jar), 'content-type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  });
  cookieJar(res, jar); // флаш бисквитката
  const back = await page(jar, res.headers.get('location') ?? '/');
  return { res, html: back.html };
}

test('без роля и без админ входът е отказан', () =>
  withApp(async () => {
    guild.members.set(USER_ID, { isOwner: false, isAdmin: false, roleIds: [] });
    await assert.rejects(login(app.url), /403/);
  }));

test('член без нужната роля не влиза; с ролята от настройките — влиза', () =>
  withApp(async () => {
    guild.members.set(USER_ID, { isOwner: false, isAdmin: false, roleIds: [ROLE.id] });
    await assert.rejects(login(app.url), /403/);
    await db.settings.update({ where: { id: 1 }, data: { dashboardRoleId: ROLE.id } });
    const jar = await login(app.url);
    const { res, html } = await page(jar, '/');
    assert.equal(res.status, 200);
    assert.match(html, /<h1>Семки<\/h1>/);
  }));

test('админ добавя партида и я вижда; грешен процент дава съобщение', () =>
  withApp(async () => {
    guild.members.set(USER_ID, { isOwner: false, isAdmin: true, roleIds: [] });
    const jar = await login(app.url);
    const ok = await post(jar, '/batches', { seedTypeKey: 'amnesia', count: '5', percent: '87,4' });
    assert.equal(ok.res.status, 303);
    assert.match(ok.html, /Добавена партида #1/);
    assert.match(ok.html, /87,40%/);
    const row = await db.batch.findFirstOrThrow();
    assert.equal(row.source, 'dashboard');
    assert.equal(row.createdById, USER_ID);

    const bad = await post(jar, '/batches', { seedTypeKey: 'amnesia', count: '5', percent: '120' });
    assert.match(bad.html, /Процентът е от 0 до 100/);
    assert.equal(await db.batch.count(), 1);
  }));

test('правило: само канал и роля от сървъра; пробното съобщение не тагва', () =>
  withApp(async () => {
    guild.members.set(USER_ID, { isOwner: true, isAdmin: false, roleIds: [] });
    const jar = await login(app.url);
    const fields = {
      kind: 'PERCENT',
      threshold: '20',
      seedTypeKey: '',
      roleId: ROLE.id,
      enabled: 'on',
    };
    const bad = await post(jar, '/alerts', { ...fields, channelId: '999999999999999999' });
    assert.match(bad.html, /Избери текстов канал от сървъра/);
    assert.equal(await db.alertRule.count(), 0);

    await post(jar, '/alerts', { ...fields, channelId: CHANNEL.id });
    const rule = await db.alertRule.findFirstOrThrow();
    assert.equal(rule.threshold, 20);
    const { html } = await page(jar, '/alerts');
    assert.match(html, /≤ 20%/);
    assert.match(html, /#семки/);

    await post(jar, `/alerts/${rule.id}/test`, {});
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.ping, false);
  }));

test('настройки: роля извън сървъра се отказва, валидните се пазят', () =>
  withApp(async () => {
    guild.members.set(USER_ID, { isOwner: false, isAdmin: true, roleIds: [] });
    const jar = await login(app.url);
    const base = {
      windowStart: '10:00',
      windowEnd: '23:00',
      timezone: 'Europe/Sofia',
      quietEnabled: 'on',
    };
    const bad = await post(jar, '/settings', {
      ...base,
      dashboardRoleId: '999999999999999999',
      commandRoleId: '',
    });
    assert.match(bad.html, /Избери роля от сървъра/);
    await post(jar, '/settings', { ...base, dashboardRoleId: ROLE.id, commandRoleId: ROLE.id });
    const s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(s.dashboardRoleId, ROLE.id);
    assert.equal(s.commandRoleId, ROLE.id);
    assert.equal(s.quietEnabled, true);
  }));

test('редакция и триене на партида от дашборда', () =>
  withApp(async () => {
    guild.members.set(USER_ID, { isOwner: false, isAdmin: true, roleIds: [] });
    const jar = await login(app.url);
    await post(jar, '/batches', { seedTypeKey: 'skunk', count: '2', percent: '40' });
    const b = await db.batch.findFirstOrThrow();
    await post(jar, `/batches/${b.id}`, { count: '7', percent: '33.5' });
    const edited = await db.batch.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(edited.count, 7);
    assert.equal(edited.percent, 33.5);
    await post(jar, `/batches/${b.id}/delete`, {});
    assert.equal(await db.batch.count(), 0);
  }));

test('изход чисти сесията', () =>
  withApp(async () => {
    guild.members.set(USER_ID, { isOwner: false, isAdmin: true, roleIds: [] });
    const jar = await login(app.url);
    const { html } = await page(jar, '/');
    const res = await fetch(`${app.url}/auth/logout`, {
      method: 'POST',
      headers: { cookie: cookieHeader(jar), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrfFrom(html) }),
      redirect: 'manual',
    });
    assert.equal(res.status, 303);
    assert.match(res.headers.getSetCookie().join('\n'), /semki_session=;/);
  }));
