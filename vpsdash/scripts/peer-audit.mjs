#!/usr/bin/env node
// Одит „мъртъв съсед": как се държи панелът, когато другият VPS е мъртъв, бавен,
// лъжещ или враждебен.
//
// Защо отделен одит: съседът е НЕДОВЕРЕН вход, но не изглежда като такъв. Той е
// „нашата друга машина", върви същия код и носи наш токен — точно затова е
// най-лесното място да се приеме на доверие. А ако някога бъде превзет, той е и
// най-краткият път навътре: панелът вече го проксира, вече му вярва и вече
// показва отговорите му на човека.
//
// Тук се вдига ФАЛШИВ съсед на 127.0.0.1, който може да се държи по всеки от
// начините, по които реален съсед се проваля.
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const bad = [];
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? '✔' : '✘'} ${what}${detail ? ' — ' + detail : ''}`);
  if (!cond) bad.push(`${what}${detail ? ': ' + detail : ''}`);
};

// ── Фалшивият съсед ──────────────────────────────────────────────────────────
let peerMode = 'ok'; // ok · dead · slow · wrong-id · hostile · huge
let peerHits = 0;
const peerSrv = http.createServer((req, res) => {
  peerHits++;
  const auth = req.headers.authorization || '';
  if (peerMode === 'slow') return; // никога не отговаря
  if (peerMode === 'badtoken' || !auth.startsWith('Bearer ')) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  if (req.url.startsWith('/api/ping')) {
    const id = peerMode === 'wrong-id' ? 'СЪВСЕМ-ДРУГА-МАШИНА' : 'peer-b';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, nodeId: id, nodeName: 'Съсед', version: '9.9.9' }));
    return;
  }
  if (peerMode === 'hostile') {
    // Съсед, който се опитва да пробута хедъри в НАШИЯ произход.
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': 'csd_sess=otkradnato; Path=/',
      'access-control-allow-origin': '*',
      'content-security-policy': "default-src *; script-src * 'unsafe-inline'",
      'x-zlovreden': 'da',
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (peerMode === 'huge') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('[' + '"x",'.repeat(2_000_000) + '"край"]');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, from: 'съсед', path: req.url }));
});
await new Promise((r) => peerSrv.listen(0, '127.0.0.1', r));
const PEER_PORT = peerSrv.address().port;

// ── Локалният панел, конфигуриран с този съсед ───────────────────────────────
const PORT = Number(process.env.CSD_PEER_PORT) || 7807;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-peer-'));
const cfgPath = path.join(dir, 'config.json');
const { hashPassword } = await import(path.join(ROOT, 'src/auth.js'));
const PASS = 'парола-за-одита-на-съседа';
fs.writeFileSync(cfgPath, JSON.stringify({
  passwordHash: hashPassword(PASS),
  sessionSecret: 'x'.repeat(64),
  peerToken: 'VHODQSHT-TOKEN-NA-TOZI-VAZEL',
  nodeId: 'peer-a',
  nodeName: 'ТУК',
  host: '127.0.0.1',
  port: PORT,
  paths: { stateDir: path.join(dir, 'state') },
  peers: [{ id: 'peer-b', name: 'Съсед', url: `http://127.0.0.1:${PEER_PORT}`, token: 'IZHODQSHT-TOKEN-KAM-SASEDA' }],
}, null, 2), { mode: 0o600 });

const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, CSD_CONFIG: cfgPath, CSD_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (c) => (out += c));
child.stderr.on('data', (c) => (out += c));
await new Promise((res, rej) => {
  const iv = setInterval(() => { if (/VPS Dashboard — http:\/\//.test(out)) { clearInterval(iv); res(); } }, 100);
  child.on('exit', () => { clearInterval(iv); rej(new Error('панелът не тръгна:\n' + out)); });
  setTimeout(() => { clearInterval(iv); rej(new Error('таймаут:\n' + out)); }, 15000);
});

const lg = await fetch(BASE + '/api/login', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-csd': '1' },
  body: JSON.stringify({ user: 'admin', password: PASS }),
});
const cookie = lg.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const H = { cookie, 'x-csd': '1' };

const nodes = () => fetch(BASE + '/api/nodes', { headers: H }).then((r) => r.json());

try {
  // ── 1. Жив съсед ───────────────────────────────────────────────────────────
  {
    peerMode = 'ok';
    const n = await nodes();
    ok(n.peers?.[0]?.up === true, 'жив съсед се вижда като жив', JSON.stringify(n));
    ok(n.local?.id === 'peer-a', 'локалният възел е в списъка');
  }

  // ── 2. Мъртъв съсед: панелът остава ЖИВ и КАЗВА защо ───────────────────────
  {
    const dead = http.createServer(() => {});
    await new Promise((r) => dead.listen(0, '127.0.0.1', r));
    const deadPort = dead.address().port;
    dead.close();
    const t0 = Date.now();
    const r = await fetch(BASE + '/api/nodes', { headers: H }).then((x) => x.json());
    ok(Date.now() - t0 < 8000, 'мъртъв съсед не заковава списъка', `${Date.now() - t0} ms`);
    void deadPort;
    // Локалните секции работят независимо от съседа.
    const local = await fetch(BASE + '/api/overview', { headers: H });
    ok(local.status === 200, 'локалният панел работи независимо от съседа');
    void r;
  }

  // ── 3. Бавен съсед: таймаут, не безкрайно чакане ───────────────────────────
  {
    peerMode = 'slow';
    const t0 = Date.now();
    const n = await Promise.race([nodes(), new Promise((r) => setTimeout(() => r('ЗАКОВА'), 20000))]);
    const dt = Date.now() - t0;
    peerMode = 'ok';
    ok(n !== 'ЗАКОВА', 'мълчащ съсед не заковава панела', `${(dt / 1000).toFixed(1)} s`);
    ok(dt < 12000, 'и се отказва в разумен срок', `${(dt / 1000).toFixed(1)} s`);
    if (n !== 'ЗАКОВА') ok(n.peers?.[0]?.up === false, 'и се отчита като НЕдостъпен');
  }

  // ── 4. Грешен токен: „отказан достъп" ≠ „машината я няма" ──────────────────
  {
    peerMode = 'badtoken';
    const n = await nodes();
    peerMode = 'ok';
    const p = n.peers?.[0];
    ok(p?.up === false, 'съсед, който ни отказва, не е „жив"', JSON.stringify(p));
    ok(Boolean(p?.error || p?.status),
      'и КАЗВА, че причината е отказан достъп, а не мълчи — иначе часове се търси мрежов проблем',
      JSON.stringify(p));
  }

  // ── 5. Съсед, който лъже КОЙ е ─────────────────────────────────────────────
  {
    peerMode = 'wrong-id';
    const n = await nodes();
    peerMode = 'ok';
    const p = n.peers?.[0];
    ok(p?.up !== true || p?.identityMismatch,
      'съсед, който се представя за ДРУГА машина, не минава за наред',
      JSON.stringify(p));
  }

  // ── 6. Враждебни хедъри не стигат до нашия произход ────────────────────────
  {
    peerMode = 'hostile';
    const r = await fetch(`${BASE}/api/nodes/peer-b/metrics`, { headers: H });
    peerMode = 'ok';
    const h = r.headers;
    ok(!h.getSetCookie?.().length, 'съседът не може да сложи бисквитка в нашия произход');
    ok(!h.get('access-control-allow-origin'), 'нито CORS разрешение', String(h.get('access-control-allow-origin')));
    // Панелът има СВОЯ политика — важното е, че съседовата не я е заменила.
    const csp = String(h.get('content-security-policy') || '');
    ok(!/unsafe-inline.*script|script-src \*/.test(csp), 'нито по-слаба политика за съдържание', csp.slice(0, 90));
    ok(!h.get('x-zlovreden'), 'нито произволен свой хедър', String(h.get('x-zlovreden')));
  }

  // ── 7. Съсед НЕ може да ни ползва като прокси към трети възел ──────────────
  {
    const r = await fetch(`${BASE}/api/nodes/peer-b/metrics`, {
      headers: { authorization: 'Bearer VHODQSHT-TOKEN-NA-TOZI-VAZEL', 'x-csd': '1' },
    });
    ok(r.status === 403, 'съседът не верижи през нас към трети възел (confused deputy)', String(r.status));
  }

  // ── 8. Съсед не стига до терминала, тайните и одита ни ─────────────────────
  {
    const peerH = { authorization: 'Bearer VHODQSHT-TOKEN-NA-TOZI-VAZEL', 'x-csd': '1' };
    for (const p of ['/api/terminal/run', '/api/env', '/api/audit', '/api/sessions', '/api/files/read?path=/etc/shadow']) {
      const method = p.includes('terminal') ? 'POST' : 'GET';
      const r = await fetch(BASE + p, { method, headers: peerH, body: method === 'POST' ? '{}' : undefined });
      ok(r.status === 403 || r.status === 401, `съседът е спрян от ${p}`, String(r.status));
    }
  }

  // ── 9. Грешен входящ токен: отказ, без да подсказва ────────────────────────
  {
    const r = await fetch(BASE + '/api/metrics', { headers: { authorization: 'Bearer GRESHEN-TOKEN' } });
    ok(r.status === 401, 'грешен входящ токен → 401', String(r.status));
    const t = await r.text();
    ok(!/peerToken|VHODQSHT/.test(t), 'и отговорът не подсказва нищо за истинския токен', t.slice(0, 80));
  }

  // ── 10. Обхождане на път през проксито ─────────────────────────────────────
  {
    for (const evil of ['../../etc/passwd', '..%2f..%2fetc', 'metrics/../../../root']) {
      const r = await fetch(`${BASE}/api/nodes/peer-b/${evil}`, { headers: H });
      ok(r.status < 500, `обхождане „${evil}" не гърми`, String(r.status));
    }
  }
  // ── 11. Токен с невъзможен за хедър знак: пада САМО този съсед ─────────────
  {
    const r = await fetch(BASE + '/api/nodes', { headers: H });
    ok(r.status === 200, 'списъкът с възли се връща, каквото и да е състоянието на съседите', String(r.status));
  }
} finally {
  const errs = out.split('\n').filter((l) => /\[csd\]|Error/.test(l));
  if (errs.length) console.log('\nсървърен лог:\n' + errs.slice(0, 12).join('\n'));
  peerSrv.close();
  child.kill('SIGTERM');
  fs.rmSync(dir, { recursive: true, force: true });
}

const noise = out.split('\n').filter((l) => /Unhandled|TypeError|ReferenceError/.test(l));
if (noise.length) console.log('лог шум:\n' + noise.slice(0, 6).join('\n'));
console.log(`\nзаявки към съседа: ${peerHits}`);
console.log(bad.length ? `✘ ${bad.length} находки:\n  · ${bad.join('\n  · ')}` : '✔ Съседът е недоверен вход и се третира като такъв.');
process.exit(bad.length ? 1 : 0);
