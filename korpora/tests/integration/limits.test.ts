import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, startApp, stopApp, type Reply } from './harness.js';
import { customer, newProject, sessionCsrf } from './people.js';

before(startApp);
after(stopApp);

/**
 * Sends `allowed` requests that must all pass the limiter, then one more that must hit it. Each case has
 * its own network (a fresh Browser), so one limiter's count never leaks into the next case.
 */
async function capAt(allowed: number, send: (k: number) => Promise<Reply>): Promise<Reply> {
  for (let k = 0; k < allowed; k++) {
    const reply = await send(k);
    assert.notEqual(reply.status, 429, `request ${k + 1} of ${allowed} was limited`);
  }
  const over = await send(allowed);
  assert.equal(over.status, 429, `request ${allowed + 1} was not limited`);
  return over;
}

test('the sign-up, forgotten password, reset and email-link forms are capped per network', async () => {
  const cases: Array<[string, number, (b: Browser, k: number) => Promise<Reply>]> = [
    ['/register', 20, (b, k) => b.register('Лимит', `limit-${k}@example.test`, 'abc')],
    ['/forgot', 5, (b) => b.submit('/forgot', '/forgot', { email: 'nobody@example.test' })],
    ['/reset', 10, (b) => b.post('/reset', { token: 'x', password: 'Short-1' })],
    ['/verify-email', 10, (b) => b.post('/verify-email', { token: 'x' })],
  ];
  for (const [path, allowed, send] of cases) {
    const b = new Browser();
    const over = await capAt(allowed, (k) => send(b, k));
    assert.match(over.body, /Твърде много|Изчакайте/, path);
  }
});

test('the second sign-in step is capped per network, whatever the session', async () => {
  const b = new Browser();
  await capAt(10, () => b.post('/login/2fa', { code: '000000', next: '/app' }));
});

test('a new confirmation link can be asked for five times an hour', async () => {
  const b = await customer('resend-limit@example.test');
  const csrf = await sessionCsrf(b);
  await capAt(5, () => b.post('/account/verify/resend', { _csrf: csrf }));
});

test('sensitive account actions are capped: the data export after thirty in a row', async () => {
  const b = await customer('sensitive-limit@example.test');
  const csrf = await sessionCsrf(b, '/account/data');
  await capAt(30, () => b.post('/account/data/export', { _csrf: csrf }));
});

test('project downloads are capped per minute and per account, not per network', async () => {
  const b = await customer('export-limit@example.test');
  const id = await newProject(b);
  await capAt(120, () => b.get(`/app/p/${id}/export/cut-list.csv`));
  // a colleague behind the same address still downloads
  const colleague = await customer('export-colleague@example.test', undefined, b.ip);
  const own = await newProject(colleague);
  assert.equal((await colleague.get(`/app/p/${own}/export/cut-list.csv`)).status, 200);
});
