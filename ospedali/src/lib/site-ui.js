// Споделен HTML слой за статичния сайт (на италиански): оформление, CSS,
// SVG графики. Нула външни ресурси — самодостатъчно (добро за CSP и Netlify).

import { esc } from './format.js';

export const CSS = `
:root{
  --bg:#f6f7f9; --surface:#fff; --ink:#15202b; --muted:#5b6b7a; --line:#e2e7ec;
  --brand:#0b5cad; --brand-ink:#08447f;
  --pos:#1a7f4b; --neg:#c0392b; --amber:#b7791f;
  --alta:#c0392b; --media:#b7791f; --bassa:#6b7a89;
  --radius:12px; --shadow:0 1px 3px rgba(16,32,48,.08),0 8px 24px rgba(16,32,48,.05);
  --maxw:1080px;
}
@media (prefers-color-scheme:dark){
  :root{ --bg:#0e141b; --surface:#161f2a; --ink:#e7edf3; --muted:#9fb0c0; --line:#26323f;
    --brand:#4d9be6; --brand-ink:#7db6ef; --pos:#3ecf8e; --neg:#ef6b5e; --amber:#e0a83a;
    --shadow:0 1px 3px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35); }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  line-height:1.55;font-size:16px}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 20px}
header.site{background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}
header.site .wrap{display:flex;align-items:center;gap:20px;min-height:60px;flex-wrap:wrap}
.brand{font-weight:700;font-size:18px;color:var(--ink);white-space:nowrap}
.brand span{color:var(--brand)}
nav.main{display:flex;gap:18px;flex-wrap:wrap;margin-left:auto;font-size:15px}
nav.main a{color:var(--muted);font-weight:500}
nav.main a:hover,nav.main a[aria-current]{color:var(--brand)}
main{padding:28px 0 60px}
h1{font-size:28px;line-height:1.2;margin:0 0 8px}
h2{font-size:21px;margin:34px 0 14px}
h3{font-size:17px;margin:22px 0 10px}
.lead{color:var(--muted);font-size:17px;max-width:70ch}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
  box-shadow:var(--shadow);padding:20px}
.grid{display:grid;gap:16px}
.kpis{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.kpi .n{font-size:26px;font-weight:700;letter-spacing:-.5px}
.kpi .l{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.4px}
.kpi .n.neg{color:var(--neg)} .kpi .n.pos{color:var(--pos)}
table{border-collapse:collapse;width:100%;font-size:14.5px}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{background:color-mix(in srgb,var(--surface) 100%,var(--ink) 4%);font-size:12.5px;
  text-transform:uppercase;letter-spacing:.4px;color:var(--muted);position:sticky;top:0;white-space:nowrap}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tbody tr:hover{background:color-mix(in srgb,var(--surface) 100%,var(--brand) 5%)}
.neg{color:var(--neg)} .pos{color:var(--pos)}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;
  line-height:1.5;color:#fff;white-space:nowrap}
.badge.alta{background:var(--alta)} .badge.media{background:var(--media)} .badge.bassa{background:var(--bassa)}
.chip{display:inline-block;padding:2px 9px;border:1px solid var(--line);border-radius:999px;
  font-size:12.5px;color:var(--muted);background:var(--surface)}
.seg{border:1px solid var(--line);border-left:4px solid var(--bassa);border-radius:8px;
  background:var(--surface);padding:12px 14px;margin:10px 0}
.seg.alta{border-left-color:var(--alta)} .seg.media{border-left-color:var(--media)}
.seg .t{font-weight:600;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.seg .d{color:var(--muted);font-size:14.5px;margin-top:4px}
.controls{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}
.controls input,.controls select{font:inherit;padding:9px 12px;border:1px solid var(--line);
  border-radius:9px;background:var(--surface);color:var(--ink);min-width:0}
.controls input[type=search]{flex:1;min-width:220px}
.muted{color:var(--muted)}
.small{font-size:13.5px}
.note{background:color-mix(in srgb,var(--surface) 100%,var(--amber) 10%);
  border:1px solid color-mix(in srgb,var(--line) 100%,var(--amber) 30%);
  border-radius:10px;padding:12px 14px;font-size:14.5px;color:var(--ink)}
.hidden{display:none!important}
figure.chart{margin:0}
figure.chart figcaption{color:var(--muted);font-size:13px;margin-top:6px}
svg .grid-line{stroke:var(--line)} svg text{fill:var(--muted);font-size:11px}
footer.site{border-top:1px solid var(--line);color:var(--muted);font-size:13.5px;padding:24px 0 50px}
footer.site a{color:var(--muted);text-decoration:underline}
.backlink{display:inline-block;margin-bottom:10px;font-size:14px}
`;

const NAV = [
  ['index.html', 'Home'],
  ['strutture.html', 'Strutture'],
  ['segnalazioni.html', 'Segnalazioni'],
  ['metodologia.html', 'Metodologia'],
];

/**
 * Обвивка на страница. `rel` е префиксът за връзки (напр. '../' за детайлните).
 */
export function page({ title, active, rel = '', body, description = '' }) {
  const nav = NAV.map(
    ([href, label]) =>
      `<a href="${rel}${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`
  ).join('');
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<style>${CSS}</style>
</head>
<body>
<header class="site"><div class="wrap">
  <a class="brand" href="${rel}index.html">Ospedali <span>Trasparenti</span></a>
  <nav class="main">${nav}</nav>
</div></header>
<main><div class="wrap">
${body}
</div></main>
<footer class="site"><div class="wrap">
  <p><strong>Ospedali Trasparenti</strong> — dati contabili delle strutture sanitarie pubbliche italiane,
  elaborati automaticamente da fonti ufficiali <em>open data</em>:
  <a href="https://openbdap.rgs.mef.gov.it/it/SSN/Analizza">BDAP — RGS/MEF</a> (modelli CE/SP del SSN) e
  <a href="https://www.dati.salute.gov.it/">dati.salute.gov.it</a> (Ministero della Salute).</p>
  <p class="small">Le segnalazioni sono indicatori automatici, non accuse: richiedono verifica.
  Importi in euro dai consuntivi annuali. Progetto a scopo di trasparenza civica — Carbon Stealth VCC.</p>
</div></footer>
</body>
</html>`;
}

/** KPI карта. */
export function kpi(label, value, cls = '') {
  return `<div class="card kpi"><div class="n ${cls}">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;
}

/** Значка за тежест. */
export function badge(gravita) {
  const t = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }[gravita] || gravita;
  return `<span class="badge ${gravita}">${t}</span>`;
}

/**
 * Линейна SVG графика с няколко серии. series:[{label,color,points:[[year,val]]}].
 * Автоскала по y; обща x-ос от подадените години.
 */
export function lineChart(series, { width = 680, height = 240, caption = '' } = {}) {
  const pad = { t: 14, r: 14, b: 26, l: 56 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const pts = series.flatMap((s) => s.points);
  if (pts.length === 0) return '';
  const xs = [...new Set(pts.map((p) => p[0]))].sort((a, b) => a - b);
  const xmin = xs[0];
  const xmax = xs.at(-1);
  const ys = pts.map((p) => p[1]);
  let ymin = Math.min(0, ...ys);
  let ymax = Math.max(0, ...ys);
  if (ymin === ymax) ymax = ymin + 1;
  const x = (yr) => pad.l + (xmax === xmin ? iw / 2 : ((yr - xmin) / (xmax - xmin)) * iw);
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

/** Стълбовидна графика за резултата по години (зелено/червено). */
export function barChart(points, { width = 680, height = 200, caption = '' } = {}) {
  const pad = { t: 14, r: 14, b: 26, l: 56 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  if (points.length === 0) return '';
  const ys = points.map((p) => p[1]);
  let ymin = Math.min(0, ...ys);
  let ymax = Math.max(0, ...ys);
  if (ymin === ymax) ymax = ymin + 1;
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

function niceTicks(min, max, n) {
  const span = max - min || 1;
  const step = niceNum(span / n);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}
function niceNum(x) {
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * 10 ** exp;
}
function fmtAxis(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' mld';
  if (a >= 1e6) return Math.round(v / 1e6).toLocaleString('it-IT') + ' mln';
  if (a >= 1e3) return Math.round(v / 1e3).toLocaleString('it-IT') + ' mila';
  return String(Math.round(v));
}
