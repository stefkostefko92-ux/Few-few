#!/usr/bin/env node
// Одит на известията ОТ КРАЙ ДО КРАЙ — срещу истински приемник, не срещу мок.
//
// Защо: аларма, която не стига, е равна на липсваща — но изглежда точно като
// работеща. Панелът показва „активна аларма", дневникът показва запис, и никъде
// не пише, че телефонът не е звъннал. Затова тук се вдига локален сървър, който
// се прави на Telegram/ntfy/webhook, и се проверява какво РЕАЛНО е пристигнало:
// формат, праг, поведение при отказ, и дали тайна е излязла навън.
//
// Всеки случай е избран, защото се случва: канал, който връща 500 (изтекъл
// токен), канал, който не отговаря (мрежа), твърде дълго тяло, и текст на
// алармата, който съдържа знаци със значение за канала.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { notify, passesSeverity, failUrl } from '../src/notify.js';

process.env.CSD_MAIL_TIMEOUT_MS ||= '2000'; // одитът не чака 20 s пред закован процес

const bad = [];
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? '✔' : '✘'} ${what}${detail ? ' — ' + detail : ''}`);
  if (!cond) bad.push(`${what}${detail ? ': ' + detail : ''}`);
};

// ── Приемникът: прави се на трите канала наведнъж ────────────────────────────
const received = [];
let mode = 'ok'; // ok · fail · hang
const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received.push({ url: req.url, headers: { ...req.headers }, body: Buffer.concat(chunks).toString('utf8') });
    if (mode === 'hang') return; // нарочно: никога не отговаря
    if (mode === 'fail') { res.writeHead(500); res.end('изтекъл токен'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

// Тайните, които НЕ бива да излизат никъде освен в самата заявка.
const BOT_TOKEN = '111222333:taina-bot-jeton-ne-trqbva-da-izticha';
const NTFY_TOKEN = 'tk_taina_ntfy_ne_trqbva_da_izticha';

// Telegram се вика по абсолютен адрес в `sendTelegram`, затова тук се проверява
// през webhook+ntfy (те са конфигурируеми), а форматът на Telegram — отделно.
const cfg = (over = {}) => ({
  nodeId: 'vps-одит',
  nodeName: 'ТЕСТОВ ВЪЗЕЛ',
  notify: {
    ntfy: { server: BASE, topic: 'тема', token: NTFY_TOKEN, ...over.ntfy },
    webhook: { url: `${BASE}/hook`, ...over.webhook },
    telegram: over.telegram,
    email: over.email,
  },
});

const reset = () => { received.length = 0; };
const A = (o = {}) => ({ severity: 'critical', key: 'проба:1', title: 'Заглавие', body: 'Тяло', ...o });

// ── 1. Форматът на всеки канал ───────────────────────────────────────────────
reset();
{
  const res = await notify(cfg(), A({ title: 'Дискът е пълен', body: 'остават 190 MB', rule: 'disk' }));
  const hook = received.find((r) => r.url === '/hook');
  const ntfy = received.find((r) => r.url !== '/hook');
  ok(res.every((r) => r.ok), 'всички канали докладват успех', JSON.stringify(res.map((r) => `${r.channel}:${r.ok}`)));
  ok(Boolean(hook), 'webhook получи заявка');
  if (hook) {
    const j = JSON.parse(hook.body);
    ok(j.severity === 'critical' && j.title === 'Дискът е пълен' && j.body === 'остават 190 MB',
      'webhook носи тежест, заглавие и тяло');
    ok(j.node === 'vps-одит' && j.nodeName === 'ТЕСТОВ ВЪЗЕЛ', 'webhook казва КОЙ възел е — иначе при два VPS не се знае');
    ok(!Number.isNaN(Date.parse(j.ts)), 'webhook носи валидна дата', j.ts);
  }
  if (ntfy) {
    ok(ntfy.headers.priority === 'high', 'ntfy маркира критичното с висок приоритет', ntfy.headers.priority);
    ok(/=\?UTF-8\?B\?/.test(ntfy.headers.title), 'кирилското заглавие е кодирано по RFC 2047 (хедърите са latin-1)', ntfy.headers.title);
    ok(ntfy.body === 'остават 190 MB', 'ntfy носи тялото както е');
  }
}

// ── 2. Прагът по канал ───────────────────────────────────────────────────────
{
  ok(passesSeverity({ severity: 'info' }, 'critical') === false, 'info не минава праг „critical"');
  ok(passesSeverity({ severity: 'critical' }, 'critical') === true, 'critical минава праг „critical"');
  // Най-лошата комбинация: получаваш алармата, но НЕ и вдигането ѝ.
  ok(passesSeverity({ severity: 'ok', wasSeverity: 'critical' }, 'critical') === true,
    '„възстановено" на критична аларма ПРЕМИНАВА прага');
  ok(passesSeverity({ severity: 'info', force: true }, 'critical') === true, 'дайджестът е изрично поискан и минава');
  reset();
  const res = await notify(cfg({ ntfy: { minSeverity: 'critical' } }), A({ severity: 'info' }));
  const n = res.find((r) => r.channel === 'ntfy');
  ok(n?.skipped === 'под прага', 'отсеченото се КАЗВА „под прага", а не се брои за изпратено', JSON.stringify(n));
  ok(!received.some((r) => r.url !== '/hook'), 'и наистина не тръгва заявка');
}

// ── 3. Съдържание със знаци, които значат нещо за канала ─────────────────────
reset();
{
  const nasty = 'a<b>&"\n\r\u0000' + 'я'.repeat(50);
  const res = await notify(cfg(), A({ title: nasty, body: nasty }));
  const hook = received.find((r) => r.url === '/hook');
  ok(res.every((r) => r.ok), 'опасните знаци не чупят нито един канал');
  ok(hook && JSON.parse(hook.body).title === nasty, 'JSON-ът на webhook-а оцелява дословно');
  const ntfy = received.find((r) => r.url !== '/hook');
  ok(ntfy && !/[\r\n]/.test(ntfy.headers.title || ''), 'нов ред в заглавието НЕ влиза суров в хедър (инжекция)',
    JSON.stringify(ntfy?.headers.title || ''));
}

// ── 4. Отказ на един канал не заглушава останалите ───────────────────────────
{
  reset();
  mode = 'fail';
  const res = await notify(cfg(), A());
  mode = 'ok';
  const failed = res.filter((r) => !r.ok);
  ok(failed.length === 2, 'и двата канала докладват ПРОВАЛ, а не тих успех', JSON.stringify(res));
  ok(res.every((r) => r.status === 500 || r.error), 'провалът носи причина (код или съобщение)');
}

// ── 5. Тайните не излизат никъде освен в самата заявка ───────────────────────
{
  reset();
  mode = 'fail';
  const res = await notify(cfg({ telegram: { botToken: BOT_TOKEN, chatId: '42' } }), A());
  mode = 'ok';
  const dump = JSON.stringify(res);
  ok(!dump.includes(BOT_TOKEN), 'жетонът на бота го няма в резултата', dump.slice(0, 160));
  ok(!dump.includes(NTFY_TOKEN), 'жетонът на ntfy го няма в резултата');
  ok(!dump.includes('api.telegram.org/bot'), 'адресът с вграден жетон не се повтаря в грешката');
  // И в самата заявка към ntfy жетонът е в Authorization, не в тялото/адреса.
  const ntfy = received.find((r) => r.url !== '/hook');
  ok(ntfy?.headers.authorization === `Bearer ${NTFY_TOKEN}`, 'ntfy жетонът пътува в Authorization');
  ok(!ntfy?.url.includes(NTFY_TOKEN) && !ntfy?.body.includes(NTFY_TOKEN), 'и НЕ в адреса или тялото (те влизат в логове)');
}

// ── 6. Канал, който не отговаря, не бива да заковава оценката ────────────────
{
  reset();
  mode = 'hang';
  const t0 = Date.now();
  const res = await Promise.race([
    notify(cfg(), A()),
    new Promise((r) => setTimeout(() => r('ЗАКОВА'), 20000)),
  ]);
  mode = 'ok';
  const dt = Date.now() - t0;
  ok(res !== 'ЗАКОВА', 'мълчащ канал НЕ заковава известяването', `${(dt / 1000).toFixed(1)} s`);
  ok(dt < 15000, 'и приключва в разумен срок', `${(dt / 1000).toFixed(1)} s`);
}

// ── 7. Имейлът също има таван на времето ─────────────────────────────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-mail-'));
  const fake = path.join(dir, 'sendmail-който-виси');
  fs.writeFileSync(fake, '#!/bin/sh\nsleep 120\n', { mode: 0o755 });
  const t0 = Date.now();
  const res = await Promise.race([
    notify({ nodeName: 'x', notify: { email: { to: 'a@b.c', sendmail: fake } } }, A()),
    new Promise((r) => setTimeout(() => r('ЗАКОВА'), 20000)),
  ]);
  const dt = Date.now() - t0;
  ok(res !== 'ЗАКОВА', 'заклещен sendmail НЕ заковава известяването', `${(dt / 1000).toFixed(1)} s`);
  if (res !== 'ЗАКОВА') {
    const e = res.find((r) => r.channel === 'email');
    ok(e && !e.ok, 'и се докладва като ПРОВАЛ, не като изпратено', JSON.stringify(e));
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── 8. Мъртвецът-ключ: „/fail" не бива да чупи адрес с параметри ─────────────
{
  ok(failUrl('https://hc-ping.com/abc') === 'https://hc-ping.com/abc/fail', 'healthchecks.io стил');
  const kuma = failUrl('https://kuma.example/api/push/TOKEN?status=up&msg=OK');
  ok(kuma.includes('/fail?') || kuma.includes('/fail'), 'Uptime Kuma: „/fail" влиза в ПЪТЯ, не след параметрите', kuma);
  ok(!kuma.endsWith('OK/fail'), 'иначе „жив, но сляп" се записва като УСПЕХ — точно обратното на целта');
}

srv.close();
console.log(bad.length ? `\n✘ ${bad.length} находки:\n  · ${bad.join('\n  · ')}` : '\n✔ Известията стигат, форматът е верен, тайните остават вътре, нищо не заковава.');
process.exit(bad.length ? 1 : 0);
