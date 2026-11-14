// Обвивката на сайта (мега-меню, footer, CSS) и прохода src/shell-site.js,
// който я прилага върху комитнатите страници без пълен ре-билд.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { page, NAV_GROUPS, CSS, minCss } from '../src/lib/site-ui.js';
import { applicaShell } from '../src/shell-site.js';
import { SITE_DIR } from '../src/lib/paths.js';

const BODY = '<h1>Titolo</h1><p>Contenuto <strong>unico</strong> della pagina.</p>';
const main = (/** @type {string} */ s) => (s.match(/<main[\s\S]*<\/main>/) || [''])[0];

test('идемпотентност: страница, току-що генерирана от page(), не се променя', () => {
  const root = page({ title: 'T — Ospedali Trasparenti', active: 'dove.html', canonical: 'dove.html', body: BODY });
  assert.equal(applicaShell(root, 'dove.html'), root);
  const deep = page({ title: 'F', active: 'fornitori.html', rel: '../', canonical: 'fornitore/123.html', body: BODY });
  assert.equal(applicaShell(deep, 'fornitore/123.html'), deep);
});

test('стара обвивка → нова: <main> и head мета остават, менюто става мега-меню', () => {
  // минимален образец на СТАРИЯ формат (едноредово меню, коментар в anti-FOUC)
  const vecchio = `<!doctype html><html lang="it"><head>
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f5f8">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d131a">
<title>Fornitore X — Ospedali Trasparenti</title>
<script>/* Анти-FOUC */
try{var _t=localStorage.getItem('ost-theme');}catch(e){}</script>
<style>body{color:red}</style>
</head>
<body>
<a href="#contenuto" class="skip">Salta al contenuto</a>
<header class="site"><div class="wrap">
  <a class="brand" href="../index.html" aria-label="home"><img src="../logo.png" alt=""></a>
  <nav class="main" id="nav-main"><a href="../index.html">Home</a><a href="../fornitori.html" aria-current="page">Fornitori</a></nav>
</div></header>
<main id="contenuto"><div class="wrap">
${BODY}
</div></main>
<footer class="site"><div class="wrap"><p>vecchio</p></div></footer>
<script>/* vecchio */</script>
</body>
</html>`;
  const nuovo = applicaShell(vecchio, 'fornitore/x.html');
  assert.ok(nuovo);
  assert.equal(main(nuovo), main(vecchio), 'съдържанието не се пипа');
  assert.match(nuovo, /<title>Fornitore X — Ospedali Trasparenti<\/title>/);
  assert.ok(!nuovo.includes('body{color:red}'), 'старият CSS е подменен');
  assert.ok(!nuovo.includes('vecchio'), 'старият footer/скрипт е подменен');
  assert.match(nuovo, /content="#f4f6f9"/);
  // активната група носи `on`, а точният елемент — aria-current (резервно от старото меню)
  assert.match(nuovo, /<li class="nav-g on"><button class="nav-b"[^>]*aria-controls="np-esplora"/);
  assert.match(nuovo, /href="\.\.\/fornitori\.html" aria-current="page"/);
  // връзките в дълбоката страница носят префикса ../
  assert.match(nuovo, /action="\.\.\/dove\.html"/);
  // и вторият проход вече не променя нищо
  assert.equal(applicaShell(nuovo, 'fornitore/x.html'), nuovo);
});

test('страница без обвивката на сайта → null (не се пипа)', () => {
  assert.equal(applicaShell('<html><body>altro</body></html>', 'x.html'), null);
});

test('aria-current: точната страница печели над резервния активен елемент', () => {
  const html = page({ title: 'Dove', active: 'approfondimenti.html', canonical: 'dove.html', body: BODY });
  const marcati = html.match(/aria-current="page"/g) || [];
  assert.equal(marcati.length, 1);
  assert.match(html, /href="dove\.html" aria-current="page"/);
});

test('всяка връзка от менюто сочи към съществуваща страница в site/', () => {
  const hrefs = NAV_GROUPS.flatMap((g) => [...g.items.map((i) => i[0]), ...(g.all ? [g.all[0]] : [])]);
  for (const h of hrefs) assert.ok(existsSync(join(SITE_DIR, h)), `липсва site/${h}`);
  const ids = NAV_GROUPS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'id на групите са уникални');
});

test('minCss маха коментарите, без да чупи стойности с интервали', () => {
  const out = minCss('/* x */ a { font-family:"Segoe UI", serif ; } /* y */\n.b > .c{ margin:0 auto } .t :focus{x:1}');
  assert.equal(out, 'a{font-family:"Segoe UI",serif}.b>.c{margin:0 auto}.t :focus{x:1}');
  assert.ok(!CSS.includes('/*'), 'вграденият CSS е без коментари');
  assert.ok(!/[а-яА-Я]/.test(CSS), 'без кирилица (коментари) в CSS-а към браузъра');
});
