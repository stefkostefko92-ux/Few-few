// Тестове за SEO политиката (src/lib/seo.js), финалния проход (src/seo-site.js)
// и IndexNow помощниците за индекс/променени адреси. Чисти, без мрежа и без fs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOGLIA_FORNITORE,
  fornitoreIndicizzabile,
  keywordsPagina,
  keywordsPerPercorso,
  descrizioneFornitore,
  leggiKpi,
  numeroDaIt,
  urlDaPercorso,
  analizzaPagina,
  impronta,
  aggiornaLastmod,
  sezioneSitemap,
  xmlUrlset,
  xmlIndice,
  impostaNoindex,
  impostaKeywords,
  sostituisciTitolo,
  disambiguaTitolo,
} from '../src/lib/seo.js';
import { trasformaPagina, bloccoAltreSchede, inserisciBlocco, nomeDaTitolo } from '../src/seo-site.js';
import { estraiVoci, eIndice, daInviare } from '../src/indexnow.js';
import { page, setSiteUrl, kpi } from '../src/lib/site-ui.js';

test('fornitoreIndicizzabile: прагът е ≥10 договора И ≥3 възложители', () => {
  assert.deepEqual({ ...SOGLIA_FORNITORE }, { contratti: 10, aziende: 3 });
  assert.equal(fornitoreIndicizzabile({ n: 10, nAziende: 3 }), true);
  assert.equal(fornitoreIndicizzabile({ n: 9, nAziende: 30 }), false);
  assert.equal(fornitoreIndicizzabile({ n: 100, nAziende: 2 }), false);
  assert.equal(fornitoreIndicizzabile({ n: NaN, nAziende: 5 }), false);
});

test('keywordsPagina: ≥5, винаги „Carbon Stealth", без дубликати', () => {
  const k = keywordsPagina(['ASL X', 'asl x', '', null]);
  assert.ok(k.length >= 5);
  assert.ok(k.includes('Carbon Stealth'));
  assert.equal(k.filter((x) => x.toLowerCase() === 'asl x').length, 1);
  const s = keywordsPerPercorso('struttura/010201-x.html', 'ASL TO 1');
  assert.ok(s.includes('bilancio ASL TO 1') && s.includes('Carbon Stealth') && s.length >= 5);
  const f = keywordsPerPercorso('fornitore/1.html', 'ACME SPA');
  assert.ok(f.includes('appalti ACME SPA') && f.includes('Carbon Stealth'));
});

test('page(): винаги има keywords meta с ≥5 думи и „Carbon Stealth"', () => {
  const h = page({ title: 'Prova — Ospedali Trasparenti', active: '', body: '' });
  const m = h.match(/<meta name="keywords" content="([^"]*)">/);
  assert.ok(m);
  const kw = m[1].split(', ');
  assert.ok(kw.length >= 5 && kw.includes('Carbon Stealth') && kw[0] === 'Prova');
});

test('descrizioneFornitore: числата правят описанието уникално; единствено число', () => {
  const d = descrizioneFornitore({ den: 'ACME SPA', n: '1', nAziende: '1', valore: '854 mila €', quotaSenzaGara: '0%' });
  assert.match(d, /^ACME SPA: 1 contratto pubblico 2023–2025 con 1 azienda sanitaria del SSN, valore messo a gara 854 mila €/);
  assert.match(descrizioneFornitore({ den: 'B', n: '22', nAziende: '5', valore: '4 mln €', quotaSenzaGara: '100%' }), /22 contratti pubblici .* 5 aziende sanitarie/);
});

test('leggiKpi/numeroDaIt: четат изхода на kpi()', () => {
  const h = kpi('Contratti', '1.234') + kpi('Aziende servite', '3');
  assert.equal(leggiKpi(h, 'Contratti'), '1.234');
  assert.equal(numeroDaIt(leggiKpi(h, 'Contratti')), 1234);
  assert.equal(numeroDaIt(leggiKpi(h, 'Aziende servite')), 3);
  assert.equal(leggiKpi(h, 'Nope'), null);
  assert.ok(Number.isNaN(numeroDaIt('—')));
});

test('urlDaPercorso + sezioneSitemap', () => {
  assert.equal(urlDaPercorso('https://x.it', 'index.html'), 'https://x.it/');
  assert.equal(urlDaPercorso('https://x.it', 'struttura/a.html'), 'https://x.it/struttura/a.html');
  assert.equal(sezioneSitemap('struttura/a.html'), 'strutture');
  assert.equal(sezioneSitemap('fornitore/1.html'), 'fornitori');
  assert.equal(sezioneSitemap('regione/lom.html'), 'pagine');
});

test('impronta: само <main> → промяна в head не мести lastmod', () => {
  const a = '<html><head><title>A</title></head><body><main>X</main></body></html>';
  const b = '<html><head><title>B</title><meta name="keywords" content="k"></head><body><main>X</main></body></html>';
  const c = '<html><head><title>A</title></head><body><main>Y</main></body></html>';
  assert.equal(impronta(a), impronta(b));
  assert.notEqual(impronta(a), impronta(c));
});

test('aggiornaLastmod: нов → снапшот; същият отпечатък → стара дата; различен → днес', () => {
  assert.deepEqual(aggiornaLastmod(undefined, 'h1', '2026-10-22', '2026-07-13'), { h: 'h1', d: '2026-07-13' });
  assert.deepEqual(aggiornaLastmod({ h: 'h1', d: '2026-07-13' }, 'h1', '2026-10-22', '2026-07-13'), { h: 'h1', d: '2026-07-13' });
  assert.deepEqual(aggiornaLastmod({ h: 'h1', d: '2026-07-13' }, 'h2', '2026-10-22', '2026-07-13'), { h: 'h2', d: '2026-10-22' });
});

test('xmlUrlset/xmlIndice: валиден sitemap и индекс, екраниран &', () => {
  const u = xmlUrlset([{ loc: 'https://x.it/a.html?b=1&c=2', lastmod: '2026-07-13' }]);
  assert.match(u, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(u, /<loc>https:\/\/x\.it\/a\.html\?b=1&amp;c=2<\/loc><lastmod>2026-07-13<\/lastmod>/);
  const i = xmlIndice([{ loc: 'https://x.it/sitemap-pagine.xml', lastmod: '2026-07-13' }]);
  assert.match(i, /<sitemapindex [^>]*>\n<sitemap><loc>https:\/\/x\.it\/sitemap-pagine\.xml<\/loc>/);
  assert.equal(eIndice(i), true);
  assert.equal(eIndice(u), false);
  assert.deepEqual(estraiVoci(i), [{ loc: 'https://x.it/sitemap-pagine.xml', lastmod: '2026-07-13' }]);
});

test('impostaNoindex/impostaKeywords: идемпотентни', () => {
  const h = '<head>\n<meta name="description" content="d">\n<link rel="canonical" href="x">\n</head>';
  const n1 = impostaNoindex(h, true);
  assert.equal(impostaNoindex(n1, true), n1);
  assert.equal(analizzaPagina(n1).noindex, true);
  assert.equal(impostaNoindex(n1, false), h);
  const k1 = impostaKeywords(h, ['a', 'b']);
  assert.match(k1, /<meta name="keywords" content="a, b">/);
  assert.equal(impostaKeywords(k1, ['z']), k1);
});

test('disambiguaTitolo/sostituisciTitolo: различител преди наставката, идемпотентно', () => {
  const t = 'AZIENDA ULSS N.9 SCALIGERA — Ospedali Trasparenti';
  const d = disambiguaTitolo(t, 'cod. 050120');
  assert.equal(d, 'AZIENDA ULSS N.9 SCALIGERA (cod. 050120) — Ospedali Trasparenti');
  assert.equal(disambiguaTitolo(d, 'cod. 050120'), d);
  assert.equal(nomeDaTitolo(d), 'AZIENDA ULSS N.9 SCALIGERA');
  const h = `<title>${t}</title><meta property="og:title" content="${t}"><meta name="twitter:title" content="${t}">`;
  assert.equal(sostituisciTitolo(h, t, d).split(d).length - 1, 3);
});

/** Минимален профил на изпълнител, както го рендерира renderFornitore. */
function profilo(n, nAz) {
  return `<!doctype html><html lang="it"><head>
<title>ACME S.P.A. — fornitore del SSN — Ospedali Trasparenti</title>
<meta name="description" content="Contratti pubblici di ACME S.P.A. con le aziende sanitarie italiane: valore, aziende, procedure.">
<link rel="canonical" href="https://x.it/fornitore/01234567890.html">
<meta property="og:description" content="Contratti pubblici di ACME S.P.A. con le aziende sanitarie italiane: valore, aziende, procedure.">
</head><body><main id="contenuto"><div class="wrap">
<h1>ACME S.P.A.</h1>
${kpi('Valore aggiudicato', '4 mln €')}${kpi('Contratti', String(n))}${kpi('Aziende servite', String(nAz))}${kpi('Quota senza gara', '20%')}
</div></main></body></html>`;
}

test('trasformaPagina: тънък профил → noindex + уникално описание + keywords; идемпотентно', () => {
  const { html, sottoSoglia } = trasformaPagina('fornitore/01234567890.html', profilo(2, 1), 'https://x.it');
  assert.equal(sottoSoglia, true);
  assert.equal(analizzaPagina(html).noindex, true);
  assert.match(html, /<meta name="description" content="ACME S\.P\.A\.: 2 contratti pubblici 2023–2025 con 1 azienda sanitaria/);
  assert.match(html, /<meta property="og:description" content="ACME S\.P\.A\.: 2 contratti/);
  assert.match(html, /<meta name="keywords" content="ACME S\.P\.A\., appalti ACME S\.P\.A\., [^"]*Carbon Stealth/);
  assert.equal(trasformaPagina('fornitore/01234567890.html', html, 'https://x.it').html, html);
});

test('trasformaPagina: богат профил остава индексируем', () => {
  const { html, sottoSoglia } = trasformaPagina('fornitore/01234567890.html', profilo(25, 4), 'https://x.it');
  assert.equal(sottoSoglia, false);
  assert.equal(analizzaPagina(html).noindex, false);
});

test('trasformaPagina: липсващ canonical → self-canonical (не и при noindex)', () => {
  setSiteUrl('');
  const h = page({ title: 'Privacy — Ospedali Trasparenti', active: '', body: '<p>x</p>' });
  const { html } = trasformaPagina('privacy.html', h, 'https://x.it');
  assert.equal(analizzaPagina(html).canonical, 'https://x.it/privacy.html');
  const n = page({ title: '404', active: '', body: '', noindex: true });
  assert.equal(analizzaPagina(trasformaPagina('404.html', n, 'https://x.it').html).canonical, null);
});

test('bloccoAltreSchede/inserisciBlocco: без сираци, идемпотентно, празен списък маха блока', () => {
  setSiteUrl('');
  const idx = page({ title: 'I fornitori del SSN — Ospedali Trasparenti', active: 'fornitori.html', body: '<h1>I fornitori</h1>' });
  const b = bloccoAltreSchede([{ rel: 'fornitore/1.html', nome: 'A & B SRL' }]);
  const con = inserisciBlocco(idx, b);
  assert.match(con, /<a href="fornitore\/1\.html">A &amp; B SRL<\/a>[\s\S]*<\/div><\/main>/);
  assert.equal(inserisciBlocco(con, b), con);
  assert.equal(inserisciBlocco(con, ''), idx);
});

test('daInviare: само нови/променени + излезлите от sitemap', () => {
  const voci = [
    { loc: 'https://x.it/a.html', lastmod: '2026-07-13' },
    { loc: 'https://x.it/b.html', lastmod: '2026-10-22' },
    { loc: 'https://x.it/c.html', lastmod: '2026-07-13' },
  ];
  const stato = { 'https://x.it/a.html': '2026-07-13', 'https://x.it/b.html': '2026-07-13', 'https://x.it/old.html': '2026-07-13' };
  const { urlList, nuovoStato } = daInviare(voci, stato);
  assert.deepEqual(urlList.sort(), ['https://x.it/b.html', 'https://x.it/c.html', 'https://x.it/old.html']);
  assert.deepEqual(Object.keys(nuovoStato).sort(), ['https://x.it/a.html', 'https://x.it/b.html', 'https://x.it/c.html']);
  assert.deepEqual(daInviare(voci, nuovoStato).urlList, []);
});
