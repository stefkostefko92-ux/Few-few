import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE,
  Browser,
  customer,
  linkIn,
  mailTo,
  prisma,
  sessionCsrf,
  staff,
  startApp,
  stopApp,
} from './harness.js';

before(startApp);
after(stopApp);

const PASSWORD = 'Shelf-Hinge-Groove-42';

test('a confirmation link opened on another device asks for a new password (no pre-hijacking)', async () => {
  const email = 'victim@example.test';
  const attacker = new Browser();
  await attacker.register('Някой Друг', email, 'Attacker-Knows-This-91');
  const link = linkIn((await mailTo(email, /Потвърдете имейла/)).text, '/verify-email?token=');
  const owner = new Browser();
  const opened = await owner.confirmEmail(link);
  assert.equal(opened.status, 303);
  assert.match(opened.location, /^\/reset\?token=[A-Za-z0-9_-]{43}&from=verify$/);
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt,
    null,
    'not confirmed before the password is set',
  );
  const page = await owner.get(opened.location);
  assert.match(page.body, /Задайте парола/);
  const token = /name="token" value="([^"]+)"/.exec(page.body)?.[1] ?? '';
  const set = await owner.post('/reset', {
    _csrf: Browser.csrf(page.body),
    token,
    password: 'Owner-Sets-Own-Pass-73',
  });
  assert.equal(set.status, 302);
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt);
  assert.notEqual((await attacker.login(email, 'Attacker-Knows-This-91')).status, 302);
  assert.equal((await owner.login(email, 'Owner-Sets-Own-Pass-73')).status, 302);
});

test('a confirmation link on the device that signed up confirms directly', async () => {
  const email = 'samedevice@example.test';
  const b = new Browser();
  await b.register('Същото Устройство', email, PASSWORD);
  const link = linkIn((await mailTo(email, /Потвърдете имейла/)).text, '/verify-email?token=');
  const opened = await b.confirmEmail(link);
  assert.equal(opened.status, 200);
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt);
});

test('names with links or addresses are refused; no name in mail to an unconfirmed address', async () => {
  const b = new Browser();
  for (const name of [
    'Иван http://evil.example',
    'Виж www.evil.example',
    'пиши на a@b.example',
    'Иван evil.com',
  ]) {
    const reply = await b.register(name, 'links@example.test', PASSWORD);
    assert.equal(reply.status, 400, name);
  }
  await b.register('Мебели 2000 ЕООД', 'company@example.test', PASSWORD);
  const mail = await mailTo('company@example.test', /Потвърдете имейла/);
  assert.ok(!mail.text.includes('Мебели 2000'), 'the name went to an unconfirmed address');
  assert.match(mail.text, /^Здравейте,\n/);
});

test('rate limits and failed sign-ins count a whole IPv6 /64, not one address', async () => {
  const net = '2001:db8:77:1::';
  for (let k = 1; k <= 10; k++) {
    const b = new Browser(`${net}${k.toString(16)}`);
    const r = await b.login('nobody@example.test', 'Wrong-Password-11');
    assert.notEqual(r.status, 429, `request ${k}`);
  }
  const eleventh = new Browser(`${net}ab`);
  assert.equal((await eleventh.login('nobody@example.test', 'Wrong-Password-11')).status, 429);
  const other = new Browser('2001:db8:77:2::1');
  assert.notEqual((await other.login('nobody@example.test', 'Wrong-Password-11')).status, 429);
  const row = await prisma.loginEvent.findFirst({ where: { ip: `${net}1` } });
  assert.equal(row?.ipNet, '2001:0db8:0077:0001::/64');
});

test('wrong passwords while signed in count too: the fifth locks the account and ends its sessions', async () => {
  const b = await customer('reauth@example.test');
  for (let k = 0; k < 5; k++) {
    const csrf = await sessionCsrf(b, '/account/security').catch(() => '');
    await b.post('/account/security/password', {
      _csrf: csrf,
      current: 'Not-The-Password-55',
      next: 'Brand-New-Password-66',
    });
  }
  const after = await b.get('/account');
  assert.equal(after.status, 302);
  assert.match(after.location, /^\/login/);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'reauth@example.test' } });
  assert.ok(user.lockedUntil && user.lockedUntil.getTime() > Date.now(), 'locked');
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
});

test('a password change gives the session a new token and voids links sent before it', async () => {
  const email = 'rotate@example.test';
  const b = await customer(email);
  const name = [...b.cookies.keys()].find((k) => k.endsWith('rd_sid')) ?? '';
  const before = b.cookies.get(name);
  const outsider = new Browser();
  await outsider.submit('/forgot', '/forgot', { email });
  const reset = linkIn((await mailTo(email, /Нова парола/)).text, '/reset?token=');
  const changed = await b.post('/account/security/password', {
    _csrf: await sessionCsrf(b, '/account/security'),
    current: PASSWORD,
    next: 'Spruce-Cabinet-Lumber-31',
  });
  assert.equal(changed.status, 302);
  assert.notEqual(b.cookies.get(name), before, 'the cookie changed');
  assert.equal((await b.get('/account')).status, 200, 'still signed in with the new cookie');
  const thief = new Browser();
  thief.cookies.set(name, before ?? '');
  assert.equal((await thief.get('/account')).status, 302, 'the old cookie opens nothing');
  assert.equal((await outsider.get(reset)).status, 400, 'the earlier reset link is void');
});

test('the email change limit counts requests, so a taken address cannot be told apart', async () => {
  await customer('taken@example.test');
  const b = await customer('changer@example.test');
  const replies: number[] = [];
  for (let k = 0; k < 4; k++) {
    const r = await b.post('/account/email', {
      _csrf: await sessionCsrf(b, '/account'),
      email: 'taken@example.test',
      password: PASSWORD,
    });
    replies.push(r.status);
  }
  const flash = await b.get('/account');
  assert.match(flash.body, /Твърде много|Изчакайте/, `fourth request: ${replies.join(',')}`);
});

test('a broken JSON body and an oversized one are client errors, not 500', async () => {
  const b = await customer('json@example.test');
  const created = await b.post('/app/projects', {
    _csrf: await sessionCsrf(b, '/app'),
    type: 'base',
    name: 'Шкаф',
  });
  const id = created.location.split('/').pop() ?? '';
  const csrf = await sessionCsrf(b, `/app/p/${id}`);
  const send = (body: string) =>
    fetch(`${BASE}/app/api/projects/${id}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
        origin: BASE,
        'x-forwarded-for': b.ip,
        cookie: [...b.cookies].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '),
      },
      body,
    });
  assert.equal((await send('{"spec":')).status, 400);
  assert.equal(
    (await send(JSON.stringify({ spec: { type: 'base', x: 'y'.repeat(70_000) } }))).status,
    413,
  );
});

test('writes of one account are capped per minute, whatever its address', async () => {
  const b = await customer('writer@example.test');
  const created = await b.post('/app/projects', {
    _csrf: await sessionCsrf(b, '/app'),
    type: 'base',
    name: 'Шкаф',
  });
  const id = created.location.split('/').pop() ?? '';
  const csrf = await sessionCsrf(b, `/app/p/${id}`);
  let limited = 0;
  for (let k = 0; k < 62; k++) {
    const r = await b.request('PUT', `/app/api/projects/${id}`, {
      json: { spec: { type: 'nope' } },
      headers: { 'x-csrf-token': csrf, 'x-forwarded-for': `9.200.${k}.9` },
    });
    if (r.status === 429) limited += 1;
  }
  assert.ok(limited >= 1, 'no 429 after 62 writes in a minute');
});

test('staff without access to sign-ins see no IP addresses and cannot search by IP', async () => {
  const target = await customer('ipowner@example.test');
  await target.get('/account');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ipowner@example.test' } });
  const ip = user.lastLoginIp ?? '';
  assert.ok(ip);
  const { browser: viewer } = await staff('VIEWER', 'viewer.ip@example.test');
  const list = await viewer.get('/admin/accounts');
  assert.ok(!list.body.includes(ip), 'the list shows the IP');
  const search = await viewer.get(`/admin/accounts?q=${encodeURIComponent(ip)}`);
  assert.ok(!search.body.includes('ipowner@example.test'), 'search by IP found the account');
  const account = await viewer.get(`/admin/accounts/${user.id}`);
  assert.ok(!account.body.includes(ip), 'the account page shows the IP');
  const dash = await viewer.get('/admin');
  assert.ok(!dash.body.includes('id="sec-h"'), 'the dashboard shows failed sign-ins');
  const { browser: analyst } = await staff('ANALYST', 'analyst.ip@example.test');
  assert.ok((await analyst.get(`/admin/accounts/${user.id}`)).body.includes(ip));
});
