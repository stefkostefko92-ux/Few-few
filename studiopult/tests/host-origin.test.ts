// Критерии 1–2: пултът слуша само на 127.0.0.1; грешен Host → 421 (DNS rebinding); POST с чужд, `null` или
// липсващ Origin → 403 (CSRF); GET от чужд сайт (Sec-Fetch-Site: cross-site) → 403.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { hostOk, originOk, fetchSiteOk } from '../src/http/guard.js';
import { startTestServer } from './helpers.js';

test('hostOk: само точно 127.0.0.1:<порт>', () => {
  assert.equal(hostOk('127.0.0.1:4390', 4390), true);
  for (const h of [
    undefined,
    '',
    'localhost:4390',
    '127.0.0.1',
    '127.0.0.1:4391',
    'evil.example:4390',
    '[::1]:4390',
    '127.0.0.1:4390.evil.example',
  ]) {
    assert.equal(hostOk(h, 4390), false, String(h));
  }
});

test('originOk: само http://127.0.0.1:<порт>', () => {
  assert.equal(originOk('http://127.0.0.1:4390', 4390), true);
  for (const o of [
    undefined,
    '',
    'null',
    'http://localhost:4390',
    'https://127.0.0.1:4390',
    'http://127.0.0.1:4390/',
    'http://evil.example',
  ]) {
    assert.equal(originOk(o, 4390), false, String(o));
  }
});

test('fetchSiteOk: липсва, same-origin или none — да; cross-site и same-site — не', () => {
  assert.equal(fetchSiteOk(undefined), true);
  assert.equal(fetchSiteOk('same-origin'), true);
  assert.equal(fetchSiteOk('none'), true);
  assert.equal(fetchSiteOk('cross-site'), false);
  assert.equal(fetchSiteOk('same-site'), false);
});

const srv = await startTestServer();
after(() => srv.close());

function raw(path: string, headers: Record<string, string>, method = 'GET', body?: string) {
  return new Promise<number>((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port: srv.port, path, method, headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

test('сървърът слуша само на 127.0.0.1', () => {
  assert.equal((srv.server.address() as AddressInfo).address, '127.0.0.1');
});

test('грешен Host → 421 дори с валиден токен', async () => {
  assert.equal(
    await raw('/api/agents', { host: `evil.example:${srv.port}`, authorization: srv.auth }),
    421,
  );
  assert.equal(
    await raw('/api/agents', { host: `localhost:${srv.port}`, authorization: srv.auth }),
    421,
  );
  assert.equal(
    await raw('/api/agents', { host: `127.0.0.1:${srv.port}`, authorization: srv.auth }),
    200,
  );
});

test('POST без, с null или с чужд Origin → 403', async () => {
  const h = {
    host: `127.0.0.1:${srv.port}`,
    authorization: srv.auth,
    'content-type': 'application/json',
  };
  const body = JSON.stringify({ task: 'doctor' });
  assert.equal(await raw('/api/task', h, 'POST', body), 403);
  assert.equal(await raw('/api/task', { ...h, origin: 'null' }, 'POST', body), 403);
  assert.equal(await raw('/api/task', { ...h, origin: 'http://evil.example' }, 'POST', body), 403);
});

test('POST с тяло, което не е JSON → 415', async () => {
  const h = {
    host: `127.0.0.1:${srv.port}`,
    authorization: srv.auth,
    origin: `http://127.0.0.1:${srv.port}`,
    'content-type': 'text/plain',
  };
  assert.equal(await raw('/api/task', h, 'POST', 'task=doctor'), 415);
});

test('GET от чужд сайт (Sec-Fetch-Site: cross-site) → 403', async () => {
  assert.equal(
    await raw('/api/agents', {
      host: `127.0.0.1:${srv.port}`,
      authorization: srv.auth,
      'sec-fetch-site': 'cross-site',
    }),
    403,
  );
});

test('отговорите носят CSP, nosniff и забрана за вграждане', async () => {
  const res = await fetch(`${srv.base}/api/agents`, { headers: { authorization: srv.auth } });
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('access-control-allow-origin'), null, 'без CORS');
});
