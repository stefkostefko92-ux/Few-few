import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import test from 'node:test';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import * as loggerModule from '../src/logger.js';
import { REDACT, httpLogOptions, stripQuery } from '../src/logger.js';

/* Регресия (Наблюдателя, 2026-09-24): pino-http логваше сесийната бисквитка на админа, Set-Cookie
   и OAuth code-а в req.url; req.id беше брояч 1, 2, 3…. Тестът минава заявка през СЪЩИТЕ опции. */

async function logLineFor(path: string, headers: Record<string, string>): Promise<string> {
  let out = '';
  const sink = new Writable({
    write(chunk, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  const logger = pino({ redact: REDACT }, sink);
  const mw = pinoHttp({ logger, ...httpLogOptions });
  const server = createServer((req, res) => {
    mw(req, res);
    res.setHeader('Set-Cookie', 'piuma_sid=NEWSESSIONSECRET; HttpOnly');
    res.setHeader('Location', '/next?code=LOCATIONSECRET');
    res.end('ok');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.end();
  });
  await new Promise((r) => setTimeout(r, 20));
  server.close();
  return out;
}

test('бисквитка, Set-Cookie и OAuth code не стигат до лога', async () => {
  const line = await logLineFor('/auth/instagram/callback?code=OAUTHSECRET123&state=x', {
    cookie: 'piuma_sid=SESSIONSECRET',
    'x-agent-signature': 'SIGSECRET',
  });
  assert.ok(line.includes('/auth/instagram/callback'), 'пътят остава');
  for (const secret of ['OAUTHSECRET123', 'SESSIONSECRET', 'NEWSESSIONSECRET', 'SIGSECRET']) {
    assert.ok(!line.includes(secret), `${secret} изтече в лога`);
  }
});

test('хедъри извън позитивния списък (proxy-authorization, x-api-key) и Location с code не изтичат', async () => {
  const line = await logLineFor('/x', {
    'proxy-authorization': 'Basic PROXYSECRET',
    'x-api-key': 'APIKEYSECRET',
    'X-Custom-Token': 'CUSTOMSECRET',
    'user-agent': 'piuma-test',
  });
  for (const secret of ['PROXYSECRET', 'APIKEYSECRET', 'CUSTOMSECRET', 'LOCATIONSECRET']) {
    assert.ok(!line.includes(secret), `${secret} изтече в лога`);
  }
  const rec = JSON.parse(line.trim().split('\n').pop() ?? '{}');
  assert.equal(rec.req?.headers?.['user-agent'], 'piuma-test', 'безопасните хедъри остават');
  assert.equal(rec.res?.headers?.location, '/next', 'Location без query');
});

test('req.id е UUID, а безопасен входящ X-Request-Id се запазва', async () => {
  const a = JSON.parse((await logLineFor('/x', {})).trim().split('\n').pop() ?? '{}');
  assert.match(String(a.req?.id), /^[0-9a-f-]{36}$/);
  const b = JSON.parse(
    (await logLineFor('/x', { 'x-request-id': 'abc12345-trace' })).trim().split('\n').pop() ?? '{}',
  );
  assert.equal(b.req?.id, 'abc12345-trace');
  const c = JSON.parse(
    (await logLineFor('/x', { 'x-request-id': 'bad id with spaces' })).trim().split('\n').pop() ??
      '{}',
  );
  assert.match(String(c.req?.id), /^[0-9a-f-]{36}$/, 'опасен входящ id се подменя');
});

/* Регресия (Стражата, 2026-11-15): x-forwarded-for и x-real-ip бяха в позитивния списък — IP адресът
   на всеки посетител влизаше в лога (лични данни, ОРЗД), а времето беше в милисекунди от epoch. */

test('IP хедърите (x-forwarded-for, x-real-ip) не стигат до лога', async () => {
  const line = await logLineFor('/x', {
    'x-forwarded-for': '203.0.113.77, 10.0.0.1',
    'x-real-ip': '198.51.100.42',
  });
  for (const ip of ['203.0.113.77', '198.51.100.42']) {
    assert.ok(!line.includes(ip), `${ip} изтече в лога`);
  }
  const rec = JSON.parse(line.trim().split('\n').pop() ?? '{}');
  assert.equal(rec.req?.remoteAddress, undefined, 'адресът на връзката (pino-http) също е IP');
});

test('времето в лога е ISO 8601 (UTC), не милисекунди от epoch', () => {
  let out = '';
  const sink = new Writable({
    write(chunk, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  const options = (loggerModule as Record<string, unknown>).logOptions as pino.LoggerOptions;
  assert.ok(options, 'logOptions липсва — logger-ът и тестът трябва да делят едни и същи опции');
  pino({ ...options, level: 'info' }, sink).info('проба');
  const rec = JSON.parse(out.trim()) as { time: unknown };
  assert.equal(typeof rec.time, 'string');
  assert.match(String(rec.time), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('stripQuery маха само query низа', () => {
  assert.equal(stripQuery('/a/b?c=1'), '/a/b');
  assert.equal(stripQuery('/a'), '/a');
  assert.equal(stripQuery(undefined), undefined);
});
