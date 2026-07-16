// Тестове за рендер-помощниците на статичния сайт (src/lib/site-ui.js):
// чисти изходни функции — екраниране, KPI/значки, хоризонтални ленти, SVG
// графики и обвивката page() (canonical/noindex + JSON-LD breakout).
// Детерминистично, без мрежа и без данни.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../src/lib/format.js';
import {
  kpi,
  badge,
  hbars,
  lineChart,
  barChart,
  page,
  setSiteUrl,
} from '../src/lib/site-ui.js';

// ---------- esc ----------
test('esc — екранира петте опасни символа', () => {
  assert.equal(esc('&'), '&amp;');
  assert.equal(esc('<'), '&lt;');
  assert.equal(esc('>'), '&gt;');
  assert.equal(esc('"'), '&quot;');
  assert.equal(esc("'"), '&#39;');
  // амперсандът се обработва пръв → без двойно екраниране
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('esc — граници: null/undefined/число → низ', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
  assert.equal(esc(42), '42');
});

// ---------- kpi ----------
test('kpi — структура, екраниране и клас', () => {
  const h = kpi('Etichetta', '1.234 €');
  assert.match(h, /class="card kpi"/);
  assert.match(h, /class="n "/); // празен клас по подразбиране
  assert.match(h, /class="l"/);
  assert.ok(h.includes('1.234 €'));
  assert.ok(h.includes('Etichetta'));
});

test('kpi — класът (neg/pos) влиза в изхода', () => {
  assert.match(kpi('Disavanzo', '−5', 'neg'), /class="n neg"/);
  assert.match(kpi('Utile', '+5', 'pos'), /class="n pos"/);
});

test('kpi — стойността и етикетът се екранират', () => {
  const h = kpi('<lbl>', '<val>');
  assert.ok(h.includes('&lt;val&gt;'));
  assert.ok(h.includes('&lt;lbl&gt;'));
  assert.ok(!h.includes('<val>'));
});

// ---------- badge ----------
test('badge — известните нива се преименуват на италиански', () => {
  assert.equal(badge('alta'), '<span class="badge alta">Alta</span>');
  assert.equal(badge('media'), '<span class="badge media">Media</span>');
  assert.equal(badge('bassa'), '<span class="badge bassa">Bassa</span>');
});

test('badge — непозната стойност минава дословно', () => {
  assert.equal(badge('altro'), '<span class="badge altro">altro</span>');
});

// ---------- hbars ----------
test('hbars — role="group", НЕ role="img"', () => {
  const h = hbars([{ label: 'A', valore: 10, quota: 0.5, flag: false }], {
    maxLabel: 'Ripartizione',
  });
  assert.ok(h.includes('role="group"'));
  assert.ok(!h.includes('role="img"'));
  assert.ok(h.includes('aria-label="Ripartizione"'));
});

test('hbars — редовете носят етикет + стойност + процент', () => {
  const h = hbars(
    [{ label: 'Farmaci', valore: 1000, quota: 0.25, flag: false }],
    { fmt: (v) => `€${v}` }
  );
  assert.ok(h.includes('Farmaci')); // етикет
  assert.ok(h.includes('€1000')); // форматирана стойност
  assert.ok(h.includes('25%')); // дял в проценти (it-IT)
  assert.match(h, /class="hbar-row"/);
});

test('hbars — flag добавя клас „flag" и значка „!"', () => {
  const h = hbars([{ label: 'Anomalia', valore: 9, quota: 1, flag: true }]);
  assert.match(h, /class="hbar-row flag"/);
  assert.ok(h.includes('badge alta'));
});

test('hbars — етикетът се екранира', () => {
  const h = hbars([{ label: '<script>', valore: 1, quota: 1, flag: false }]);
  assert.ok(h.includes('&lt;script&gt;'));
  assert.ok(!h.includes('<script>'));
});

test('hbars — празен вход → празен низ', () => {
  assert.equal(hbars([]), '');
});

test('hbars — quota=0 не дели на нула (минимална ширина)', () => {
  const h = hbars([{ label: 'Zero', valore: 0, quota: 0, flag: false }]);
  assert.ok(h.includes('Zero'));
  assert.match(h, /width:1\.0%/); // Math.max(1, …) предпазва от 0/0
});

// ---------- lineChart ----------
test('lineChart — връща <svg> с role="img" за реални данни', () => {
  const h = lineChart(
    [{ label: 'Ricavi', color: '#0b5cad', points: [[2019, 100], [2020, 200]] }],
    { caption: 'Andamento' }
  );
  assert.ok(h.includes('<svg'));
  assert.ok(h.includes('role="img"'));
  assert.ok(h.includes('<figcaption>Andamento</figcaption>'));
});

test('lineChart — етикетът на серията и надписът се екранират', () => {
  const h = lineChart(
    [{ label: '<b>Serie', color: '#000', points: [[2019, 1], [2020, 2]] }],
    { caption: '<x>' }
  );
  assert.ok(h.includes('&lt;b&gt;Serie'));
  assert.ok(!h.includes('<b>Serie'));
});

test('lineChart — празни точки → празен низ', () => {
  assert.equal(lineChart([]), '');
  assert.equal(lineChart([{ label: 'A', color: '#000', points: [] }]), '');
});

test('lineChart — една точка (xmin===xmax) не чупи скалата', () => {
  const h = lineChart([{ label: 'A', color: '#000', points: [[2020, 50]] }]);
  assert.ok(h.includes('<svg'));
  assert.ok(!h.includes('NaN'));
});

// ---------- barChart ----------
test('barChart — връща <svg>; зелено/червено по знака', () => {
  const h = barChart([[2019, -5], [2020, 10]], { caption: 'Risultato' });
  assert.ok(h.includes('<svg'));
  assert.ok(h.includes('var(--neg)')); // отрицателна стойност
  assert.ok(h.includes('var(--pos)')); // положителна стойност
  assert.ok(h.includes('<figcaption>Risultato</figcaption>'));
});

test('barChart — празен вход → празен низ', () => {
  assert.equal(barChart([]), '');
});

test('barChart — единична стойност (ymin===ymax) без NaN', () => {
  const h = barChart([[2020, 7]]);
  assert.ok(h.includes('<svg'));
  assert.ok(!h.includes('NaN'));
});

// ---------- page ----------
test('page — базова обвивка без SITE_URL: без canonical, с описание', () => {
  setSiteUrl(''); // релативен режим (по подразбиране)
  const h = page({
    title: 'Titolo',
    active: 'index.html',
    body: '<p>ciao</p>',
    description: 'Descrizione',
  });
  assert.ok(h.startsWith('<!doctype html>'));
  assert.ok(h.includes('<title>Titolo</title>'));
  assert.ok(h.includes('<p>ciao</p>'));
  assert.ok(h.includes('<meta name="description" content="Descrizione">'));
  // празен siteUrl → никакви абсолютни meta (canonical/og:url)
  assert.ok(!h.includes('rel="canonical"'));
  assert.ok(!h.includes('og:url'));
});

test('page — noindex добавя robots meta; без noindex — не', () => {
  setSiteUrl('');
  const yes = page({ title: 'T', active: '', body: '', noindex: true });
  assert.ok(yes.includes('<meta name="robots" content="noindex">'));
  const no = page({ title: 'T', active: '', body: '' });
  assert.ok(!no.includes('name="robots"'));
});

test('page — заглавието се екранира в <title> и og:title', () => {
  setSiteUrl('');
  const h = page({ title: 'A & <b>', active: '', body: '' });
  assert.ok(h.includes('<title>A &amp; &lt;b&gt;</title>'));
  assert.ok(!h.includes('<title>A & <b></title>'));
});

test('page — canonical се появява само при зададен SITE_URL', () => {
  setSiteUrl('https://example.com');
  try {
    const h = page({
      title: 'T',
      active: 'appalti.html',
      body: '',
      canonical: 'appalti.html',
    });
    assert.ok(
      h.includes('<link rel="canonical" href="https://example.com/appalti.html">')
    );
    assert.ok(h.includes('property="og:url"'));
    // canonical:'/' → коренът на домейна (началната страница)
    const home = page({ title: 'Home', active: 'index.html', body: '', canonical: '/' });
    assert.ok(home.includes('<link rel="canonical" href="https://example.com/">'));
  } finally {
    setSiteUrl(''); // връщаме глобалното състояние
  }
});

test('page — JSON-LD breakout: </script> в jsonld се екранира', () => {
  setSiteUrl('');
  const jsonld = { name: 'X</script><script>alert(1)</script>' };
  const h = page({ title: 'T', active: '', body: '', jsonld });
  // всяко „<" от полезния товар става < → няма пробив
  assert.ok(h.includes('\\u003c/script>'));
  assert.ok(!h.includes('<script>alert(1)'));
  // таговете са балансирани → payload-ът не е пробил (отваряния = затваряния);
  // страницата има фиксирани скриптове (ld+json + мобилното меню), но нито един
  // допълнителен от товара
  const opens = h.match(/<script[\s>]/g) || [];
  const closes = h.match(/<\/script>/g) || [];
  assert.equal(opens.length, closes.length);
  assert.ok(!h.includes('<script>alert'));
});

test('page — без jsonld няма ld+json блок', () => {
  setSiteUrl('');
  const h = page({ title: 'T', active: '', body: '' });
  assert.ok(!h.includes('application/ld+json'));
});
