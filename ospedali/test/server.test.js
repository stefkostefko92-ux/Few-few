// Тестове за чистата логика на админ сервиза (без мрежа).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applicaVista, hashVisitatore, giornoDi, eBot } from '../server/lib/analytics.js';
import { hashPassword, verifyPassword, signSession, verifySession, parseCookies } from '../server/lib/auth.js';
import { hideCss, iniettaHideCss, nomePagina, isHidden } from '../server/lib/visibility.js';

// ── analytics ────────────────────────────────────────────────────────────────
test('applicaVista агрегира по ден, път и уникални', () => {
  const s = { byDay: {}, byPath: {} };
  applicaVista(s, { path: '/a.html', giorno: '2026-07-14', nuovoVisitatore: true });
  applicaVista(s, { path: '/a.html', giorno: '2026-07-14', nuovoVisitatore: false });
  applicaVista(s, { path: '/b.html', giorno: '2026-07-14', nuovoVisitatore: true });
  assert.equal(s.totalViews, 3);
  assert.equal(s.byDay['2026-07-14'].views, 3);
  assert.equal(s.byDay['2026-07-14'].visitors, 2);
  assert.equal(s.byPath['/a.html'], 2);
  assert.equal(s.byPath['/b.html'], 1);
});

test('applicaVista: бот → само botViews, без views/visitors/byPath', () => {
  const s = { byDay: {}, byPath: {} };
  applicaVista(s, { path: '/a.html', giorno: '2026-07-15', nuovoVisitatore: false, bot: true });
  applicaVista(s, { path: '/a.html', giorno: '2026-07-15', nuovoVisitatore: true });
  assert.equal(s.botViews, 1);
  assert.equal(s.totalViews, 1); // само човешкото посещение
  assert.equal(s.byDay['2026-07-15'].views, 1);
  assert.equal(s.byDay['2026-07-15'].visitors, 1);
  assert.equal(s.byPath['/a.html'], 1);
});

test('eBot разпознава краулери и скриптове, пуска браузъри', () => {
  // ботове/краулери/скриптове
  assert.equal(eBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(eBot('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'), true);
  assert.equal(eBot('Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'), true);
  assert.equal(eBot('curl/8.5.0'), true);
  assert.equal(eBot('python-requests/2.31.0'), true);
  assert.equal(eBot('facebookexternalhit/1.1'), true);
  assert.equal(eBot(''), true); // липсващ UA = скрипт
  assert.equal(eBot(null), true);
  // истински браузъри
  assert.equal(eBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'), false);
  assert.equal(eBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), false);
  assert.equal(eBot('Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'), false);
});

test('hashVisitatore е детерминиран и не съдържа суровия IP', () => {
  const salt = 'x';
  const h1 = hashVisitatore(salt, '1.2.3.4', 'UA');
  const h2 = hashVisitatore(salt, '1.2.3.4', 'UA');
  const h3 = hashVisitatore(salt, '9.9.9.9', 'UA');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.ok(!h1.includes('1.2.3.4'));
});

test('giornoDi връща YYYY-MM-DD', () => {
  assert.match(giornoDi(new Date('2026-07-14T10:00:00Z')), /^2026-07-14$/);
});

// ── auth ─────────────────────────────────────────────────────────────────────
test('парола: hash + verify', () => {
  const rec = hashPassword('segreto123');
  assert.ok(verifyPassword('segreto123', rec));
  assert.ok(!verifyPassword('sbagliata', rec));
  assert.ok(!verifyPassword('segreto123', null));
});

test('сесия: валидна, подправена, изтекла', () => {
  const secret = 's3cr3t';
  const now = 1_000_000;
  const tok = signSession(secret, 3600, now);
  assert.ok(verifySession(secret, tok, now + 1000));
  assert.equal(verifySession(secret, tok, now + 3600 * 1000 + 1), null); // изтекла
  assert.equal(verifySession(secret, tok + 'x', now), null); // подправен подпис
  assert.equal(verifySession('altro', tok, now), null); // грешен ключ
  assert.equal(verifySession(secret, null, now), null);
});

test('parseCookies', () => {
  const c = parseCookies('a=1; ost_admin=abc.def; b=2');
  assert.equal(c.ost_admin, 'abc.def');
  assert.equal(c.a, '1');
});

// ── visibility ───────────────────────────────────────────────────────────────
test('nomePagina + isHidden', () => {
  assert.equal(nomePagina('/cordate.html'), 'cordate.html');
  assert.equal(nomePagina('/fornitore/123.html'), '123.html');
  assert.equal(nomePagina('/'), 'index.html');
  assert.equal(nomePagina('/x.csv'), null);
  assert.ok(isHidden('/cordate.html', ['cordate.html']));
  assert.ok(!isHidden('/appalti.html', ['cordate.html']));
});

test('hideCss генерира селектори само за валидни имена', () => {
  const css = hideCss(['cordate.html', 'segnali-gare.html', 'bad;name']);
  assert.match(css, /a\[href\$="cordate\.html"\]/);
  assert.match(css, /a\[href\$="segnali-gare\.html"\]/);
  assert.ok(!css.includes('bad;name'));
  assert.equal(hideCss([]), '');
});

test('iniettaHideCss вмъква преди </head>', () => {
  const html = '<html><head><title>x</title></head><body>y</body></html>';
  const out = iniettaHideCss(html, ['cordate.html']);
  assert.ok(out.indexOf('vis-hide') < out.indexOf('</head>'));
  assert.ok(out.includes('<body>y</body>'));
  assert.equal(iniettaHideCss(html, []), html); // без скрити → без промяна
});
