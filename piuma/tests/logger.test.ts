import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import test from 'node:test';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
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

test('stripQuery маха само query низа', () => {
  assert.equal(stripQuery('/a/b?c=1'), '/a/b');
  assert.equal(stripQuery('/a'), '/a');
  assert.equal(stripQuery(undefined), undefined);
});
