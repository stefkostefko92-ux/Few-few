// Тест на „ръцете" на агентите към панела (propose.mjs) срещу ФАЛШИВ панел на
// 127.0.0.1 — нищо не излиза навън.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { panelBase, agentKey, main } from './propose.mjs';

test('propose: адресът на панела — само https (освен локално), без вградени данни за вход', () => {
  assert.equal(panelBase('https://vps.example.test/път'), 'https://vps.example.test');
  assert.equal(panelBase('http://127.0.0.1:7700'), 'http://127.0.0.1:7700');
  assert.throws(() => panelBase('http://vps.example.test'), /https/);
  assert.throws(() => panelBase('https://u:p@vps.example.test'), /име\/парола/);
  assert.throws(() => panelBase('не е адрес'), /валиден/);
});

test('propose: ключът — само от средата, без интервали', () => {
  assert.throws(() => agentKey({}), /CSD_AGENT_KEY/);
  assert.throws(() => agentKey({ CSD_AGENT_KEY: 'ab cd' }), /интервал/);
  assert.equal(agentKey({ CSD_AGENT_KEY: ' abc \n' }), 'abc');
});

test('propose: подаване срещу фалшив панел — заглавка, отказ без преглед, без ключ в аргументите', async () => {
  const seen = [];
  const KEY = 'k'.repeat(43);
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.method === 'POST' ? { id: '0123456789abcdef', status: 'pending' } : { ok: true }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const env = { CSD_PANEL_URL: `http://127.0.0.1:${srv.address().port}`, CSD_AGENT_KEY: KEY };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-propose-'));
  const log = console.log;
  const printed = [];
  console.log = (s) => printed.push(String(s));
  try {
    const file = path.join(dir, 'p.json');
    const proposal = { agent: 'VPS-аджията', title: 't', why: 'w', action: { type: 'service.restart', params: { unit: 'a.service' } } };
    // Без преглед от Claude — отказ, ПРЕДИ да тръгне заявка.
    fs.writeFileSync(file, JSON.stringify(proposal));
    await assert.rejects(main(['submit', file], env), /review/);
    assert.equal(seen.length, 0, 'без преглед нищо не тръгва към панела');
    // С преглед — POST със схемата CSD-Agent.
    fs.writeFileSync(file, JSON.stringify({ ...proposal, review: 'Claude: ок' }));
    await main(['submit', file], env);
    assert.equal(seen[0].method, 'POST');
    assert.equal(seen[0].url, '/api/agent/proposals');
    assert.equal(seen[0].auth, `CSD-Agent ${KEY}`);
    // Ключът никога не се отпечатва.
    assert.ok(!printed.join('\n').includes(KEY), 'ключът не бива да е в изхода');
    // Ключ като аргумент се отказва (влиза в историята на шела).
    await assert.rejects(main(['diag', '--key=' + KEY], env), /САМО през CSD_AGENT_KEY/);
    // Невалиден id за status се отказва локално.
    await assert.rejects(main(['status', '../../api/env'], env), /16/);
  } finally {
    console.log = log;
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
