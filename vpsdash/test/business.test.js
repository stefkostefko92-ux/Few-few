// Петъчният отчет „Бизнесът тази седмица" — съставянето (чиста функция), колекторът
// срещу живи локални източници (добър · бавен · лъжещ · мъртъв · чужд адрес),
// разходът на агентите, „Чака теб" и графикът по софийско време.
//
// Отчетът напуска сървъра (Telegram/имейл): носи само числа. Източник, който не
// отговаря, се КАЗВА — тишината не е „нула продажби".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

import {
  composeBusiness,
  collectBusiness,
  agentsWeek,
  waitingSummary,
  fmtMoney,
  BUSINESS_SCHEDULE,
} from '../src/business.js';
import { DigestSchedule } from '../src/digest.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'csd-business-'));
const FAKTURIST = {
  app: 'fakturist',
  window: { from: '2026-11-20T15:00:00.000Z', to: '2026-11-27T15:00:00.000Z', fromDay: '2026-11-21', toDay: '2026-11-27' },
  platform: {
    organizations: { total: 41, new: 3 },
    subscriptions: { paid: 12, granted: 2, pastDue: 1, new: 2 },
    payments: { completed: 2, completedCents: 23400, pendingTransfers: 1 },
    documentsIssued: 187,
    remindersSent: 4,
  },
  supplier: {
    issued: { count: 3, cents: { EUR: 127700, BGN: 5000 } },
    creditNotes: { count: 1, cents: { EUR: 2000 } },
    paid: { cents: { EUR: 6000 } },
    overdue: { count: 1, cents: { EUR: 20000 } },
  },
};

// ── Пари ──────────────────────────────────────────────────────────
test('пари: цели центове → български запис, без float', () => {
  assert.equal(fmtMoney(23400, 'EUR'), '234,00 €');
  assert.equal(fmtMoney(123456789, 'EUR'), '1 234 567,89 €');
  assert.equal(fmtMoney(5000, 'BGN'), '50,00 лв.');
  assert.equal(fmtMoney(7, 'USD'), '0,07 $');
  assert.equal(fmtMoney(-2000, 'EUR'), '−20,00 €');
  assert.equal(fmtMoney(100, 'CHF'), '1,00 CHF');
});

// ── Съставянето ───────────────────────────────────────────────────
test('отчет: числата на Фактурист, книгите, агентите и „Чака теб" — на редове с доказателство', () => {
  const text = composeBusiness({
    sources: [{ name: 'Фактурист', ok: true, data: FAKTURIST }],
    agents: { runs: 23, usd: 41.2, unpriced: 0, top: [{ agent: 'kodadjiyata', usd: 18.1 }] },
    waiting: { total: 52, urgent: 0, action: 7, generatedAt: '2026-11-23T17:04:02.427Z', top: ['#317 docs(mastilko)'] },
    now: Date.parse('2026-11-27T15:00:00Z'),
  });
  assert.match(text, /^💼 Бизнесът тази седмица · 21\.11–27\.11/);
  assert.match(text, /Фактурист: 3 нови фирми \(общо 41\) · платени абонаменти 12 \(\+2 нови\)/);
  assert.match(text, /плащания 2 за 234,00 €/);
  assert.match(text, /⚠ чакащи банкови преводи: 1/);
  assert.match(text, /издадени 3 за 1 277,00 € \+ 50,00 лв\./);
  assert.match(text, /платени 60,00 €/);
  assert.match(text, /⚠ просрочени 1 за 200,00 €/);
  assert.match(text, /кредитни известия 1 за 20,00 €/);
  assert.match(text, /напомняния: 4/);
  assert.match(text, /Агентите: 23 пускания · 41,20 \$ · най-скъп kodadjiyata 18,10 \$/);
  assert.match(text, /Чака теб: 7 за действие от 52 .*#317/);
  assert.match(text, /снимка от 23\.11/, 'старостта на „Чака теб" се казва');
});

test('отчет: недостъпен източник се КАЗВА; без книги — без ред за книгите', () => {
  const text = composeBusiness({
    sources: [
      { name: 'Фактурист', ok: true, data: { ...FAKTURIST, supplier: null } },
      { name: 'Linketto', ok: false, error: 'таймаут' },
    ],
    agents: null,
    waiting: null,
    now: Date.parse('2026-11-27T15:00:00Z'),
  });
  assert.match(text, /❓ Linketto: недостъпен \(таймаут\)/);
  assert.doesNotMatch(text, /издадени \d/);
  assert.match(text, /Агентите: няма данни/);
});

test('отчет: без нито един източник казва как се настройва, не мълчи', () => {
  const text = composeBusiness({ sources: [], agents: null, waiting: null, now: Date.now() });
  assert.match(text, /няма настроени източници.*business\.sources/);
});

// ── Колекторът срещу живи локални сървъри ─────────────────────────
function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test('колектор: добър · бавен · лъжещ · мъртъв · чужд адрес · без токен', async () => {
  const dir = tmp();
  const tokenFile = path.join(dir, 'token');
  fs.writeFileSync(tokenFile, 'd'.repeat(64) + '\n', { mode: 0o600 });
  let seenAuth = null;
  const good = await serve((req, res) => {
    seenAuth = req.headers.authorization;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(FAKTURIST));
  });
  const slow = await serve(() => {}); // никога не отговаря
  const liar = await serve((_req, res) => res.end('<html>не съм JSON</html>'));
  const wrongShape = await serve((_req, res) => res.end(JSON.stringify({ app: 'fakturist', platform: 'x' })));
  const dead = await serve(() => {});
  const deadPort = dead.address().port;
  await new Promise((r) => dead.close(r));
  const url = (srv) => `http://127.0.0.1:${srv.address().port}/internal/weekly`;
  try {
    const out = await collectBusiness(
      {
        business: {
          sources: [
            { name: 'Фактурист', url: url(good), tokenFile },
            { name: 'Бавен', url: url(slow), tokenFile },
            { name: 'Лъжец', url: url(liar), tokenFile },
            { name: 'Крив', url: url(wrongShape), tokenFile },
            { name: 'Мъртъв', url: `http://127.0.0.1:${deadPort}/internal/weekly`, tokenFile },
            { name: 'Чужд', url: 'https://example.com/internal/weekly', tokenFile },
            { name: 'Без токен', url: url(good), tokenFile: path.join(dir, 'nyama') },
          ],
        },
      },
      { timeoutMs: 300 },
    );
    const by = Object.fromEntries(out.map((s) => [s.name, s]));
    assert.equal(by['Фактурист'].ok, true);
    assert.equal(by['Фактурист'].data.platform.documentsIssued, 187);
    assert.equal(seenAuth, `Bearer ${'d'.repeat(64)}`, 'токенът е от файла, без новия ред');
    assert.match(by['Бавен'].error, /таймаут/);
    assert.match(by['Лъжец'].error, /неверен отговор/);
    assert.match(by['Крив'].error, /неверен отговор/);
    assert.match(by['Мъртъв'].error, /отказ/);
    assert.doesNotMatch(by['Мъртъв'].error, /недостъпен/, 'отчетът вече казва „недостъпен (…)“ — причината не го повтаря');
    assert.match(by['Чужд'].error, /само 127\.0\.0\.1/);
    assert.match(by['Без токен'].error, /токен/);
    assert.ok(out.every((s) => s.ok || typeof s.error === 'string'), 'всеки има или данни, или причина');
  } finally {
    for (const s of [good, slow, liar, wrongShape]) s.closeAllConnections?.(), s.close();
  }
});

// ── Агентите ──────────────────────────────────────────────────────
const PRICES = {
  models: [
    { id: 'opus-5-5', in: 4, out: 20, cacheRead: 0.4 },
    { id: 'sonnet-5-5', in: 3, out: 15 },
  ],
  cache: { read: 0.1, write: 1.25, write1h: 2 },
};
let recN = 0;
const rec = (agent, ts, model, extra = {}) =>
  JSON.stringify({ v: 2, id: `r${String(++recN).padStart(9, '0')}`, agent, ts, model, input: 1000, cacheRead: 100000, cacheWrite: 20000, output: 3000, ...extra });

test('агентите: само последните 7 дни; непознатият модел се брои „без цена", не се гадае', () => {
  const usage = [
    rec('kodadjiyata', '2026-11-26T10:00', 'opus-5-5'),
    rec('kodadjiyata', '2026-11-25T10:00', 'opus-5-5'),
    rec('seo', '2026-11-24T10:00', 'sonnet-5-5'),
    rec('seo', '2026-11-10T10:00', 'opus-5-5'), // извън
    rec('dizayner', '2026-11-26T11:00', 'mistery-9'),
    '{не е JSON',
    JSON.stringify({ v: 2, id: 'evalevalev', agent: 'x', ts: '2026-11-26T10:00', model: 'opus-5-5', eval: true, input: 1, output: 1 }), // живи проби не се броят
  ].join('\n');
  const a = agentsWeek(usage, PRICES, Date.parse('2026-11-27T15:00:00Z'));
  assert.equal(a.runs, 4);
  assert.equal(a.unpriced, 1);
  assert.equal(a.top[0].agent, 'kodadjiyata');
  // opus: 1000*4 + 100000*0.4 + 20000*1.25*4 + 3000*20 = 4000+40000+100000+60000 = 204000 / 1e6 = 0.204
  assert.ok(Math.abs(a.top[0].usd - 0.408) < 1e-9, String(a.top[0].usd));
});

test('агентите: сметката съвпада с tools/lib/usage.mjs (едни цени, без разминаване)', async (t) => {
  const lib = path.resolve(import.meta.dirname, '..', '..', 'tools', 'lib', 'usage.mjs');
  const pricesFile = path.resolve(import.meta.dirname, '..', '..', 'tools', 'agents', 'prices.json');
  if (!fs.existsSync(lib) || !fs.existsSync(pricesFile)) return t.skip('извън монорепото');
  const { costOf, loadPrices } = await import(pathToFileURL(lib));
  const prices = loadPrices(pricesFile);
  const line = rec('kodadjiyata', '2026-11-26T10:00', 'opus-5-5', { cacheWrite1h: 5000 });
  const mine = agentsWeek(line, JSON.parse(fs.readFileSync(pricesFile, 'utf8')), Date.parse('2026-11-27T00:00:00Z')).usd;
  assert.ok(Math.abs(mine - costOf(JSON.parse(line), prices)) < 1e-9, `${mine} ≠ ${costOf(JSON.parse(line), prices)}`);
});

// ── „Чака теб" ────────────────────────────────────────────────────
test('„Чака теб": чете window.WAITING; счупен файл → null, не изключение', () => {
  const js = `window.WAITING = ${JSON.stringify({
    generatedAt: '2026-11-23T17:04:02.427Z',
    counts: { total: 52, 'спешно': 1, 'действие': 7, 'внимание': 28, 'инфо': 16 },
    items: [
      { kind: 'PR', ref: '#317', level: 'действие', title: 'docs(mastilko): нещо' },
      { kind: 'claim', ref: 'x', level: 'спешно', title: 'изтича утре' },
      { kind: 'PR', ref: '#1', level: 'инфо', title: 'не се показва' },
    ],
  })};\n`;
  const w = waitingSummary(js);
  assert.equal(w.total, 52);
  assert.equal(w.urgent, 1);
  assert.equal(w.action, 7);
  assert.deepEqual(w.top, ['x изтича утре', '#317 docs(mastilko): нещо']);
  assert.equal(waitingSummary('alert(1)'), null);
  assert.equal(waitingSummary(''), null);
});

// ── Графикът: петък 17:00 по софийско време, независимо от часовата зона на машината ──
test('график: петък 17:00 София (UTC+2 зимно); догонва изпуснатото; изключен по подразбиране без източници', () => {
  const dir = tmp();
  const s = new DigestSchedule(dir, BUSINESS_SCHEDULE);
  const cfg = { alerts: { business: {} }, business: { sources: [{ name: 'Ф', url: 'http://127.0.0.1:1/x', tokenFile: '/x' }] } };
  assert.equal(s.due(cfg, Date.parse('2026-11-27T15:30:00Z')), true, '17:30 в София, петък');
  assert.equal(s.due(cfg, Date.parse('2026-11-27T17:30:00Z')), false, '19:30 в София');
  assert.equal(s.due(cfg, Date.parse('2026-11-26T15:30:00Z')), false, 'четвъртък');
  s.state.lastSentAt = '2026-11-13T15:30:00Z'; // преди 2 седмици
  assert.equal(s.due(cfg, Date.parse('2026-11-25T09:00:00Z')), true, 'изпуснат → догонва');
  const none = new DigestSchedule(tmp(), BUSINESS_SCHEDULE);
  assert.equal(none.due({ alerts: {}, business: { sources: [] } }, Date.parse('2026-11-27T15:30:00Z')), false);
  // старият дайджест не се е сменил: понеделник 8:00 по часовника на машината, собствен файл
  const old = new DigestSchedule(tmp());
  assert.equal(old.status({}).weekday, 1);
  assert.equal(old.status({}).hour, 8);
});

// ── Прегледът на PR #504 (Кодаджията) ─────────────────────────────
test('агентите: повторен id е ЕДНО пускане — по-късният (по-новата версия) печели, като parseLedger', () => {
  const lines = [
    JSON.stringify({ v: 2, id: 'aaaaaaaaaa', agent: 'kodadjiyata', ts: '2026-11-26T10:00', model: 'opus-5-5', input: 1, cacheRead: 0, cacheWrite: 0, output: 1 }),
    JSON.stringify({ v: 2, id: 'aaaaaaaaaa', agent: 'kodadjiyata', ts: '2026-11-26T10:00', model: 'opus-5-5', input: 1000, cacheRead: 100000, cacheWrite: 20000, output: 3000 }),
    JSON.stringify({ v: 2, id: 'bbbbbbbbbb', agent: 'seo', ts: '2026-11-26T10:00', model: 'opus-5-5', input: 'много', output: 1 }), // нечислово → вън
    JSON.stringify({ v: 2, agent: 'seo', ts: '2026-11-26T10:00', model: 'opus-5-5', input: 1, output: 1 }), // без id → вън
  ].join('\n');
  const a = agentsWeek(lines, PRICES, Date.parse('2026-11-27T15:00:00Z'));
  assert.equal(a.runs, 1);
  assert.ok(Math.abs(a.usd - 0.204) < 1e-9, String(a.usd));
});

test('агентите: ts без зона е UTC, не местното време на машината', (t) => {
  const tz = process.env.TZ;
  process.env.TZ = 'Pacific/Kiritimati'; // UTC+14 — без поправката прозорецът се мести с 14 часа
  t.after(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });
  const line = JSON.stringify({ v: 2, id: 'cccccccccc', agent: 'x', ts: '2026-11-20T15:30', model: 'opus-5-5', input: 1, output: 1 });
  // Точно на ръба: 7×24 ч преди 2026-11-27T15:30Z — вътре, независимо от TZ на процеса.
  assert.equal(agentsWeek(line, PRICES, Date.parse('2026-11-27T15:30:00Z')).runs, 1);
  assert.equal(agentsWeek(line, PRICES, Date.parse('2026-11-27T15:31:00Z')).runs, 0);
});

test('график: недоставен отчет не е „пратен" — опит пак след час, до 24 пъти; доставеният нулира', () => {
  const s = new DigestSchedule(tmp(), BUSINESS_SCHEDULE);
  const cfg = { alerts: {}, business: { sources: [{ name: 'Ф', url: 'http://127.0.0.1:1/x', tokenFile: '/x' }] } };
  s.state.lastSentAt = '2026-11-20T15:10:00Z';
  const at = Date.parse('2026-11-27T15:10:00Z'); // петък 17:10 София
  assert.equal(s.due(cfg, at), true);
  s.attempt(at); // каналите паднаха
  assert.equal(s.due(cfg, at + 20 * 60000), false, 'не веднага пак');
  assert.equal(s.due(cfg, at + 61 * 60000), true, 'след час — пак, макар слотът да е минал');
  for (let i = 1; i < 24; i++) s.attempt(at + i * 61 * 60000);
  assert.equal(s.due(cfg, at + 25 * 61 * 60000), false, 'след 24 неуспеха — спира до следващия слот/догонване');
  s.record('ok');
  assert.equal(s.state.failedAttempts, 0);
});
