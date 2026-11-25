'use strict';
// Имейлите от публичната форма за контакт/оферта (lib/mailer.js) — вход от непознат посетител
// към пощата на администратора. Всяко поле се екранира; количествата и цените от количката са
// само ориентир (1–999, „a preventivo“ без цена); писмото към посетителя не носи нищо, което
// той е написал (иначе формата става релейна поща за спам/фишинг).
// (Изпитателя, класиране по риск 21.11.2026 — P3, юнит частта.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAdminHtml, buildUserHtml } = require('../lib/mailer');

const XSS = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
const base = {
  nome: XSS, email: `a${XSS}@b.it`, tel: XSS, azienda: XSS, citta: XSS, servizio: XSS,
  messaggio: XSS, msgId: 'MSG-1', source: 'contatti',
};

test('админ писмото: всяко поле от формата е екранирано', () => {
  const html = buildAdminHtml({ ...base, items: [{ name: XSS, codice: XSS, qty: 1, price: 10 }], totale: 10 });
  assert.ok(!html.includes('<script>'), 'суров <script>');
  assert.ok(!html.includes('<img src=x'), 'суров <img>');
  assert.ok(html.includes('&lt;script&gt;'), 'екранираният текст липсва');
});

test('количката: количеството е цяло 1–999, цена липсва/0/текст → „a preventivo“', () => {
  const items = [
    { name: 'A', qty: '5000', price: 2 },
    { name: 'B', qty: '-3', price: 2 },
    { name: 'C', qty: '2.7', price: '' },
    { name: 'D', qty: 1, price: 'abc' },
    { name: 'E', qty: 1, price: 0 },
  ];
  const html = buildAdminHtml({ ...base, items, totale: 'NaN' });
  assert.ok(html.includes('>999<'), 'таванът 999');
  assert.ok(!html.includes('>5000<') && !html.includes('>-3<'));
  assert.equal((html.match(/>a preventivo</g) || []).length, 3, 'празна, текст и 0 → a preventivo');
  assert.ok(html.includes('0,00 + preventivo'), 'totale NaN → 0,00');
});

test('писмото към посетителя носи само номера на запитването', () => {
  const html = buildUserHtml({ ...base, msgId: 'MSG-42' });
  assert.ok(html.includes('MSG-42'));
  assert.ok(!html.includes('script'), 'текст от формата стигна до писмото към посетителя');
});
