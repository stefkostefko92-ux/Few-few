// @ts-check
// Споделен HTML слой за статичния сайт (на италиански): оформление, CSS,
// SVG графики. Нула външни ресурси — самодостатъчно (добро за CSP и Netlify).

import { esc } from './format.js';

/**
 * Точка от графика: `[година, стойност]` (масив от 2 числа — избягва
 * tuple-inference проблеми при `.map((a) => [a, v])`).
 * @typedef {number[]} Punto
 */
/**
 * @typedef {object} Serie серия за линейна графика
 * @property {string} label
 * @property {string} color
 * @property {Punto[]} points
 */
/**
 * @typedef {object} HbarItem ред за хоризонтална лента
 * @property {string} label
 * @property {number} valore
 * @property {number} quota дял [0..1]
 * @property {boolean} [flag]
 */
/**
 * @typedef {object} PageOpts опции за обвивката на страница
 * @property {string} title
 * @property {string} [active] активен елемент от менюто (href)
 * @property {string} [rel] префикс за връзки (напр. '../')
 * @property {string} body
 * @property {string} [description]
 * @property {string|null} [canonical] релативен път спрямо корена
 * @property {Record<string, unknown>|null} [jsonld]
 * @property {string} [ogType]
 * @property {boolean} [noindex]
 */

export const CSS = `
:root{
  /* палитра — светла тема (институционална, сдържана) */
  --bg:#f3f5f8; --surface:#ffffff; --surface-2:#f8fafc;
  --ink:#131c26; --ink-2:#33424f; --muted:#586878; --faint:#8595a4;
  --line:#e2e8ee; --line-2:#eef2f6;
  --brand:#0b5cad; --brand-ink:#08447f; --brand-tint:#eaf2fb;
  --pos:#1a7f4b; --neg:#c0392b; --amber:#b7791f;
  --alta:#c0392b; --media:#8a5a12; --bassa:#566473;
  /* скала на разстоянията (4-точкова база) */
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px; --s7:48px; --s8:64px;
  /* радиуси и релеф */
  --radius:12px; --radius-sm:8px; --radius-lg:16px;
  --shadow-sm:0 1px 2px rgba(16,32,48,.06);
  --shadow:0 1px 3px rgba(16,32,48,.07),0 10px 28px rgba(16,32,48,.05);
  --maxw:1120px; --measure:70ch;
  --font:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){
  :root{ --bg:#0d131a; --surface:#151e29; --surface-2:#1b2531;
    --ink:#e8eef4; --ink-2:#c3d0dc; --muted:#9fb0c0; --faint:#7d8ea0;
    --line:#26323f; --line-2:#202b37;
    --brand:#4d9be6; --brand-ink:#7db6ef; --brand-tint:#17293c;
    --pos:#3ecf8e; --neg:#ef6b5e; --amber:#e0a83a;
    /* --alta/--media/--bassa НЕ се пипат: значките са с бял текст → тъмен фон
       държи WCAG AA контраст (alta ~4.5, media ~5.9, bassa ~5.2 : 1) */
    --shadow-sm:0 1px 2px rgba(0,0,0,.35);
    --shadow:0 1px 3px rgba(0,0,0,.4),0 10px 28px rgba(0,0,0,.35); }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);
  line-height:1.6;font-size:16px;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:2px}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:3px}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 20px}

/* ---------- Masthead / навигация ---------- */
header.site{background:var(--surface);border-top:3px solid var(--brand);
  border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}
header.site .wrap{display:flex;align-items:center;gap:8px 24px;min-height:58px;flex-wrap:wrap}
.brand{display:inline-flex;align-items:center;line-height:0}
.brand-logo{height:36px;width:auto;display:block}
/* тъмна тема: тъмносиният надпис не се чете на тъмния хедър → лека светла
   подложка запазва пълноцветното лого четимо, без да губим детайла на иконата */
@media (prefers-color-scheme:dark){
  .brand{background:#eef3f9;border-radius:9px;padding:5px 10px}
}
nav.main{display:flex;gap:2px;flex-wrap:wrap;margin-left:auto;font-size:14.5px}
nav.main a{color:var(--muted);font-weight:500;padding:7px 11px;border-radius:8px;
  line-height:1.2;white-space:nowrap;transition:background-color .15s,color .15s}
nav.main a:hover{color:var(--brand-ink);background:var(--brand-tint);text-decoration:none}
nav.main a[aria-current]{color:var(--brand-ink);font-weight:650;background:var(--brand-tint)}
@media(max-width:900px){
  header.site{position:static;border-top-width:3px}
  /* nowrap е ключово: при многолинеен column flex редът се разпъва до
     най-широкото дете (934px) и nav-скролът не се задейства → хор. scroll */
  header.site .wrap{flex-direction:column;flex-wrap:nowrap;align-items:stretch;gap:0;padding-top:10px}
  .brand{align-self:flex-start;margin-bottom:8px}
  .brand-logo{height:32px}
  nav.main{margin-left:0;flex-wrap:nowrap;overflow-x:auto;gap:2px;max-width:100%;min-width:0;
    border-top:1px solid var(--line);padding:7px 0;
    scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch}
  nav.main::-webkit-scrollbar{display:none}
}
main{padding:var(--s7) 0 var(--s6)}

/* ---------- Типографска скала ---------- */
h1{font-size:clamp(28px,1.4rem + 1.6vw,38px);line-height:1.15;letter-spacing:-.02em;
  margin:0 0 var(--s3);max-width:22ch;font-weight:700}
h2{font-size:clamp(20px,1.1rem + .5vw,24px);line-height:1.25;letter-spacing:-.01em;
  margin:var(--s7) 0 var(--s4);font-weight:650}
h3{font-size:17px;line-height:1.3;margin:var(--s5) 0 var(--s3);font-weight:650}
p{max-width:var(--measure)}
.lead{color:var(--ink-2);font-size:clamp(16.5px,1rem + .3vw,19px);line-height:1.55;
  max-width:66ch;margin:0 0 var(--s3)}
main>.wrap>h1:first-child + .lead{font-size:clamp(17px,1rem + .4vw,20px)}

/* ---------- Карти / решетка ---------- */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
  box-shadow:var(--shadow-sm);padding:var(--s5)}
.grid{display:grid;gap:var(--s4)}
.kpis{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.kpi{display:flex;flex-direction:column;gap:6px;padding:18px 20px;
  border-left:3px solid var(--line-2)}
.kpi .n{font-size:clamp(24px,1.4rem + .7vw,30px);font-weight:700;letter-spacing:-.02em;
  line-height:1.05;font-variant-numeric:tabular-nums;color:var(--ink)}
.kpi .l{color:var(--muted);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.kpi .n.neg{color:var(--neg)} .kpi .n.pos{color:var(--pos)}
.kpi:has(.n.neg){border-left-color:var(--neg)} .kpi:has(.n.pos){border-left-color:var(--pos)}

/* ---------- Таблици ---------- */
table{border-collapse:collapse;width:100%;font-size:14.5px}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);
  background:var(--surface);box-shadow:var(--shadow-sm)}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--line-2);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
th{background:var(--surface-2);font-size:11.5px;font-weight:650;
  text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
  position:sticky;top:0;white-space:nowrap;border-bottom:1px solid var(--line)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tbody tr:nth-child(even){background:color-mix(in srgb,var(--surface) 100%,var(--ink) 2.5%)}
tbody tr:hover{background:var(--brand-tint)}
.neg{color:var(--neg)} .pos{color:var(--pos)}

/* ---------- Значки и чипове ---------- */
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:650;
  line-height:1.5;color:#fff;white-space:nowrap;letter-spacing:.01em}
.badge.alta{background:var(--alta)} .badge.media{background:var(--media)} .badge.bassa{background:var(--bassa)}
.chip{display:inline-block;padding:5px 12px;border:1px solid var(--line);border-radius:999px;
  font-size:13px;font-weight:500;color:var(--ink-2);background:var(--surface);
  transition:border-color .15s,background-color .15s}
.chip:hover{border-color:var(--brand);background:var(--brand-tint);color:var(--brand-ink);text-decoration:none}

/* ---------- Сигнали ---------- */
.seg{border:1px solid var(--line);border-left:4px solid var(--bassa);border-radius:var(--radius-sm);
  background:var(--surface);padding:13px 16px;margin:var(--s3) 0;box-shadow:var(--shadow-sm)}
.seg.alta{border-left-color:var(--alta)} .seg.media{border-left-color:var(--media)}
.seg .t{font-weight:650;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.seg .d{color:var(--muted);font-size:14.5px;margin-top:5px;max-width:var(--measure)}

/* ---------- Форма / контроли ---------- */
.controls{display:flex;gap:10px;flex-wrap:wrap;margin:var(--s5) 0}
.controls input,.controls select{font:inherit;padding:10px 13px;border:1px solid var(--line);
  border-radius:var(--radius-sm);background:var(--surface);color:var(--ink);min-width:0}
.controls input:focus,.controls select:focus{outline:none;border-color:var(--brand);
  box-shadow:0 0 0 3px var(--brand-tint)}
.controls input[type=search]{flex:1;min-width:220px}
.controls button{font:inherit;padding:10px 18px;border:1px solid var(--brand);border-radius:var(--radius-sm);
  background:var(--brand);color:#fff;cursor:pointer;font-weight:650;transition:filter .15s}
.controls button:hover{filter:brightness(1.08)}

/* ---------- Карта на Италия ---------- */
.mapfig{margin:var(--s6) 0}
.mapfig svg.italia{display:block;width:100%;max-width:660px;height:auto;margin:0 auto}
.mapfig svg a{cursor:pointer}
.mapfig svg a path{transition:stroke-width .12s}
.mapfig svg a:hover rect{stroke:var(--ink);stroke-width:2}
.mapfig svg a:hover path{stroke:var(--ink);stroke-width:1.6}
.mapfig svg a:focus{outline:none}
.mapfig svg a:focus path{stroke:var(--ink);stroke-width:2}
.maplegend{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:var(--s3) 0;justify-content:center}

/* ---------- Помощни / бележки ---------- */
.muted{color:var(--muted)}
.small{font-size:13.5px}
.note{background:color-mix(in srgb,var(--surface) 100%,var(--amber) 9%);
  border:1px solid color-mix(in srgb,var(--line) 100%,var(--amber) 32%);
  border-radius:var(--radius-sm);padding:13px 16px;font-size:14.5px;color:var(--ink);
  max-width:var(--measure)}
.note strong{color:var(--ink)}
.hidden{display:none!important}
.skip{position:absolute;left:-9999px;top:0;background:var(--brand);color:#fff;padding:9px 16px;border-radius:0 0 8px 0;z-index:20;font-weight:600}
.skip:focus{left:0}

/* ---------- Графики ---------- */
figure.chart{margin:0}
figure.chart figcaption{color:var(--muted);font-size:13px;margin-top:8px;line-height:1.4;max-width:var(--measure)}
.hbars{display:flex;flex-direction:column;gap:9px;margin:var(--s2) 0}
.hbar-row{display:grid;grid-template-columns:minmax(120px,1.4fr) 3fr minmax(120px,auto);gap:12px;align-items:center;font-size:13.5px}
.hbar-l{color:var(--ink)} .hbar-row.flag .hbar-l{font-weight:650}
.hbar-track{background:color-mix(in srgb,var(--surface) 100%,var(--ink) 8%);border-radius:6px;height:14px;overflow:hidden}
.hbar-fill{height:100%;border-radius:6px}
.hbar-v{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
@media(max-width:640px){.hbar-row{grid-template-columns:1fr;gap:2px}.hbar-v{text-align:left}}
/* САМО за графиките (.chart) — глобален selector би презаписал атрибутите
   на етикетите върху картата на Италия (CSS бие SVG presentation атрибути) */
.chart svg .grid-line{stroke:var(--line)} .chart svg text{fill:var(--muted);font-size:11px}

/* ---------- Footer ---------- */
footer.site{border-top:1px solid var(--line);background:var(--surface-2);
  color:var(--muted);font-size:13.5px;padding:var(--s6) 0 var(--s7);margin-top:var(--s6)}
footer.site .wrap>p{max-width:82ch;margin:0 0 var(--s3)}
footer.site strong{color:var(--ink-2)}
footer.site a{color:var(--muted);text-decoration:underline;text-underline-offset:2px}
footer.site a:hover{color:var(--brand)}
.backlink{display:inline-block;margin-bottom:var(--s3);font-size:14px;font-weight:500}

/* ---------- Достъпност: намалено движение ---------- */
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;
    transition-duration:.001ms!important;scroll-behavior:auto!important}
}
`;

const NAV = [
  ['index.html', 'Home'],
  ['inchiesta.html', 'Inchiesta'],
  ['conflitti.html', 'Conflitti'],
  ['appalti.html', 'Appalti'],
  ['fornitori.html', 'Fornitori'],
  ['cerca.html', 'Cerca'],
  ['classifiche.html', 'Classifiche'],
  ['regioni.html', 'Regioni'],
  ['strutture.html', 'Strutture'],
  ['segnalazioni.html', 'Segnalazioni'],
  ['approfondimenti.html', 'Approfondimenti'],
  ['dati.html', 'Dati'],
  ['metodologia.html', 'Metodologia'],
];

// Абсолютният адрес на сайта (за canonical/OG/sitemap). Задава се веднъж от
// build-site през setSiteUrl(); празен = релативни адреси (без absolute meta).
let SITE_URL = '';
/**
 * @param {string|null|undefined} url
 * @returns {void}
 */
export function setSiteUrl(url) {
  SITE_URL = (url || '').replace(/\/$/, '');
}
/** @returns {string} */
export function siteUrl() {
  return SITE_URL;
}

/**
 * Обвивка на страница. `rel` е префиксът за връзки (напр. '../' за детайлните).
 * `canonical` е релативният път на страницата спрямо корена (по подр. = `active`,
 * което е вярно за страниците от менюто). `jsonld` инжектира JSON-LD блок.
 * @param {PageOpts} opts
 * @returns {string}
 */
export function page({ title, active, rel = '', body, description = '', canonical = null, jsonld = null, ogType = 'website', noindex = false }) {
  const nav = NAV.map(
    ([href, label]) =>
      `<a href="${rel}${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`
  ).join('');
  const path = canonical != null ? canonical : active;
  // canonical:'/' = коренът на домейна (началната страница, не /index.html)
  const abs = !SITE_URL ? null : path === '/' ? `${SITE_URL}/` : path ? `${SITE_URL}/${path}` : null;
  const meta = [
    noindex ? '<meta name="robots" content="noindex">' : '',
    abs ? `<link rel="canonical" href="${esc(abs)}">` : '',
    `<meta property="og:type" content="${esc(ogType)}">`,
    `<meta property="og:site_name" content="Ospedali Trasparenti">`,
    `<meta property="og:locale" content="it_IT">`,
    `<meta property="og:title" content="${esc(title)}">`,
    description ? `<meta property="og:description" content="${esc(description)}">` : '',
    abs ? `<meta property="og:url" content="${esc(abs)}">` : '',
    SITE_URL ? `<meta property="og:image" content="${esc(SITE_URL)}/og.png">` : '',
    SITE_URL ? `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : '',
    `<meta name="twitter:card" content="${SITE_URL ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    description ? `<meta name="twitter:description" content="${esc(description)}">` : '',
    jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="${rel}favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="32x32" href="${rel}favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="${rel}favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="${rel}apple-touch-icon.png">
<link rel="manifest" href="${rel}site.webmanifest">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f5f8">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d131a">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${meta}
<style>${CSS}</style>
</head>
<body>
<a href="#contenuto" class="skip">Salta al contenuto</a>
<header class="site"><div class="wrap">
  <a class="brand" href="${rel}index.html" aria-label="Ospedali Trasparenti — home"><img class="brand-logo" src="${rel}logo.png" width="502" height="134" alt="Ospedali Trasparenti"></a>
  <nav class="main" aria-label="Principale">${nav}</nav>
</div></header>
<main id="contenuto"><div class="wrap">
${body}
</div></main>
<footer class="site"><div class="wrap">
  <p><strong>Ospedali Trasparenti</strong> — dati contabili e appalti delle strutture sanitarie pubbliche italiane,
  elaborati automaticamente da fonti ufficiali <em>open data</em>.</p>
  <p class="small"><strong>Fonti e licenze.</strong> Elaborazione propria su:
  <a href="https://dati.anticorruzione.it/opendata">ANAC — Banca Dati Nazionale dei Contratti Pubblici</a> (CC BY 4.0);
  <a href="https://openbdap.rgs.mef.gov.it/it/SSN/Analizza">BDAP — RGS/MEF</a>, modelli CE/SP del SSN (IODL 2.0);
  <a href="https://www.dati.salute.gov.it/">Ministero della Salute</a>. I dati sono stati aggregati, normalizzati ed
  elaborati; eventuali errori di elaborazione non sono imputabili ai titolari delle fonti.</p>
  <p class="small">Le segnalazioni e gli indicatori sono automatici, <strong>non accuse</strong>: richiedono verifica.
  Progetto di trasparenza civica senza scopo di lucro — <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a>. Non è una testata giornalistica.
  <a href="${rel}verifiche.html">Dati e verifiche</a> · <a href="${rel}metodologia.html">Metodologia</a> ·
  <a href="${rel}note-legali.html">Note legali</a> · <a href="${rel}privacy.html">Privacy</a> ·
  <a href="${rel}accessibilita.html">Accessibilità</a> · <a href="${rel}feed.xml">RSS</a></p>
</div></footer>
</body>
</html>`;
}

/**
 * KPI карта.
 * @param {string} label
 * @param {string|number} value
 * @param {string} [cls]
 * @returns {string}
 */
export function kpi(label, value, cls = '', sub = '') {
  // `sub` = незадължителен приглушен под-текст до стойността. Екранира се (не подавай
  // готов HTML в value/sub — kpi() ги екранира, иначе маркъпът излиза като текст).
  const subHtml = sub ? ` <span class="small muted">${esc(sub)}</span>` : '';
  return `<div class="card kpi"><div class="n ${cls}">${esc(value)}${subHtml}</div><div class="l">${esc(label)}</div></div>`;
}

/**
 * Значка за тежест.
 * @param {string} gravita
 * @returns {string}
 */
export function badge(gravita) {
  const t = /** @type {Record<string, string>} */ ({ alta: 'Alta', media: 'Media', bassa: 'Bassa' })[gravita] || gravita;
  return `<span class="badge ${gravita}">${t}</span>`;
}

/**
 * Линейна SVG графика с няколко серии. series:[{label,color,points:[[year,val]]}].
 * Автоскала по y; обща x-ос от подадените години.
 * @param {Serie[]} series
 * @param {{ width?: number, height?: number, caption?: string }} [opts]
 * @returns {string}
 */
export function lineChart(series, { width = 680, height = 240, caption = '' } = {}) {
  const pad = { t: 14, r: 14, b: 26, l: 56 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const pts = series.flatMap((s) => s.points);
  if (pts.length === 0) return '';
  const xs = [...new Set(pts.map((p) => p[0]))].sort((a, b) => a - b);
  const xmin = xs[0];
  const xmax = xs.at(-1) ?? xmin;
  const ys = pts.map((p) => p[1]);
  let ymin = Math.min(0, ...ys);
  let ymax = Math.max(0, ...ys);
  if (ymin === ymax) ymax = ymin + 1;
  /** @type {(yr: number) => number} */
  const x = (yr) => pad.l + (xmax === xmin ? iw / 2 : ((yr - xmin) / (xmax - xmin)) * iw);
  /** @type {(v: number) => number} */
  const y = (v) => pad.t + ih - ((v - ymin) / (ymax - ymin)) * ih;

  const ticks = niceTicks(ymin, ymax, 4);
  const gridlines = ticks
    .map(
      (t) =>
        `<line class="grid-line" x1="${pad.l}" y1="${y(t).toFixed(1)}" x2="${width - pad.r}" y2="${y(t).toFixed(1)}"/>` +
        `<text x="${pad.l - 6}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${fmtAxis(t)}</text>`
    )
    .join('');
  const xlabels = xs
    .filter((_, i) => xs.length <= 8 || i % 2 === 0)
    .map((yr) => `<text x="${x(yr).toFixed(1)}" y="${height - 8}" text-anchor="middle">${yr}</text>`)
    .join('');
  const paths = series
    .map((s) => {
      const p = s.points
        .slice()
        .sort((a, b) => a[0] - b[0])
        .map((pt, i) => `${i ? 'L' : 'M'}${x(pt[0]).toFixed(1)},${y(pt[1]).toFixed(1)}`)
        .join(' ');
      const dots = s.points
        .map((pt) => `<circle cx="${x(pt[0]).toFixed(1)}" cy="${y(pt[1]).toFixed(1)}" r="2.5" fill="${s.color}"/>`)
        .join('');
      return `<path d="${p}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}`;
    })
    .join('');
  const legend = series
    .map(
      (s, i) =>
        `<g transform="translate(${pad.l + i * 190},${pad.t})"><rect width="11" height="11" y="-9" fill="${s.color}" rx="2"/>` +
        `<text x="16" y="0" style="fill:var(--ink)">${esc(s.label)}</text></g>`
    )
    .join('');
  const zero =
    ymin < 0 && ymax > 0
      ? `<line class="grid-line" x1="${pad.l}" y1="${y(0).toFixed(1)}" x2="${width - pad.r}" y2="${y(0).toFixed(1)}" stroke-width="1.5"/>`
      : '';
  return (
    `<figure class="chart"><svg viewBox="0 0 ${width} ${height}" role="img" width="100%" preserveAspectRatio="xMidYMid meet" aria-label="${esc(caption)}">` +
    `${gridlines}${zero}${xlabels}${paths}<g transform="translate(0,4)">${legend}</g></svg>` +
    (caption ? `<figcaption>${esc(caption)}</figcaption>` : '') +
    `</figure>`
  );
}

/**
 * Стълбовидна графика за резултата по години (зелено/червено).
 * @param {Punto[]} points
 * @param {{ width?: number, height?: number, caption?: string }} [opts]
 * @returns {string}
 */
export function barChart(points, { width = 680, height = 200, caption = '' } = {}) {
  const pad = { t: 14, r: 14, b: 26, l: 56 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  if (points.length === 0) return '';
  const ys = points.map((p) => p[1]);
  let ymin = Math.min(0, ...ys);
  let ymax = Math.max(0, ...ys);
  if (ymin === ymax) ymax = ymin + 1;
  /** @type {(v: number) => number} */
  const y = (v) => pad.t + ih - ((v - ymin) / (ymax - ymin)) * ih;
  const bw = Math.min(46, (iw / points.length) * 0.7);
  const step = iw / points.length;
  const ticks = niceTicks(ymin, ymax, 4);
  const gridlines = ticks
    .map(
      (t) =>
        `<line class="grid-line" x1="${pad.l}" y1="${y(t).toFixed(1)}" x2="${width - pad.r}" y2="${y(t).toFixed(1)}"/>` +
        `<text x="${pad.l - 6}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${fmtAxis(t)}</text>`
    )
    .join('');
  const bars = points
    .map((p, i) => {
      const cx = pad.l + step * i + step / 2;
      const y0 = y(0);
      const y1 = y(p[1]);
      const top = Math.min(y0, y1);
      const h = Math.max(1, Math.abs(y1 - y0));
      const color = p[1] < 0 ? 'var(--neg)' : 'var(--pos)';
      return (
        `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="2"/>` +
        `<text x="${cx.toFixed(1)}" y="${height - 8}" text-anchor="middle">${p[0]}</text>`
      );
    })
    .join('');
  return (
    `<figure class="chart"><svg viewBox="0 0 ${width} ${height}" role="img" width="100%" preserveAspectRatio="xMidYMid meet" aria-label="${esc(caption)}">` +
    `${gridlines}${bars}</svg>` +
    (caption ? `<figcaption>${esc(caption)}</figcaption>` : '') +
    `</figure>`
  );
}

/**
 * Хоризонтални ленти за разбивка (категория → дял). items:[{label,valore,quota,flag}].
 * @param {HbarItem[]} items
 * @param {{ fmt?: (v: number) => string|number, maxLabel?: string }} [opts]
 * @returns {string}
 */
export function hbars(items, { fmt = (v) => v, maxLabel = '' } = {}) {
  if (!items.length) return '';
  const max = Math.max(...items.map((i) => i.quota || 0), 0.0001);
  const rows = items
    .map((i) => {
      const w = Math.max(1, ((i.quota || 0) / max) * 100);
      const col = i.flag ? 'var(--neg)' : 'var(--brand)';
      return `<div class="hbar-row${i.flag ? ' flag' : ''}">
        <div class="hbar-l">${esc(i.label)}${i.flag ? ' <span class="badge alta" style="padding:0 6px">!</span>' : ''}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${w.toFixed(1)}%;background:${col}"></div></div>
        <div class="hbar-v">${esc(fmt(i.valore))}<span class="muted small"> · ${(i.quota * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</span></div>
      </div>`;
    })
    .join('');
  // role="group" (не "img"): групата носи етикет, но редовете етикет→стойност→%
  // остават четими за екранни четци (данните са текст, не картина).
  return `<div class="hbars" role="group" aria-label="${esc(maxLabel)}">${rows}</div>`;
}

/**
 * @param {number} min
 * @param {number} max
 * @param {number} n
 * @returns {number[]}
 */
function niceTicks(min, max, n) {
  const span = max - min || 1;
  const step = niceNum(span / n);
  const start = Math.ceil(min / step) * step;
  /** @type {number[]} */
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}
/**
 * @param {number} x
 * @returns {number}
 */
function niceNum(x) {
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * 10 ** exp;
}
/**
 * @param {number} v
 * @returns {string}
 */
function fmtAxis(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' mld';
  if (a >= 1e6) return Math.round(v / 1e6).toLocaleString('it-IT') + ' mln';
  if (a >= 1e3) return Math.round(v / 1e3).toLocaleString('it-IT') + ' mila';
  return String(Math.round(v));
}
