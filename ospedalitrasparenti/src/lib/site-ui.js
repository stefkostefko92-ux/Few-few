// @ts-check
// Споделен HTML слой за статичния сайт (на италиански): оформление, CSS,
// SVG графики. Нула външни ресурси — самодостатъчно (добро за CSP и Netlify).
//
// Обвивката (горна лента, masthead с мега-меню, footer, скриптове) е изнесена в
// чисти функции (`shellHead`, `shellTop`, `shellBottom`), за да може
// src/shell-site.js да я подмени и в комитнатите страници, които не могат да се
// прегенерират без суровите данни (профилите на изпълнителите и др.).

import { esc } from './format.js';
import { keywordsPagina } from './seo.js';

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
 * @property {string[]} [keywords] специфичните ключови думи (допълват се до ≥5 с „Carbon Stealth")
 * @property {string} [css] допълнителен CSS само за тази страница (втори <style>, извън обвивката)
 */

// Дизайн система „Conto pubblico“. Идеята: сайтът е публичен счетоводен регистър —
// институционално синьо (от логото), хладна хартия, сериф за заглавията като в
// официален отчет, табличните цифри навсякъде, а единственият „смел“ елемент е
// счетоводната двойна черта под резултата (началната страница). Без външни шрифтове:
// системни стекове (сериф: Charter/Iowan на Apple, Sitka/Cambria на Windows,
// Noto Serif/DejaVu на Android/Linux). Коментарите тук НЕ стигат до браузъра —
// `minCss()` ги маха (≈половината байтове на всяка страница бяха коментари).
const CSS_SRC = `
:root{
  /* палитра — светла тема */
  --bg:#f4f6f9; --surface:#ffffff; --surface-2:#f7f9fc;
  --ink:#0f1d2b; --ink-2:#2c3b4a; --muted:#536373; --faint:#8392a1;
  --line:#e0e6ed; --line-2:#edf1f5;
  /* --line-strong: граница за интерактивни контроли (WCAG 1.4.11 ≥3:1 спрямо surface) */
  --line-strong:#8392a1;
  --brand:#0b5cad; --brand-ink:#08427c; --brand-tint:#eaf2fb;
  /* --navy: горната лента и footer-ът — еднакви и в двете теми (институционален подпис) */
  --navy:#0d2036; --navy-2:#13304f; --on-navy:#dbe6f2; --on-navy-2:#a9bdd2;
  --pos:#1a7f4b; --neg:#c0392b; --amber:#b7791f;
  --alta:#c0392b; --media:#8a5a12; --bassa:#566473;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px; --s7:48px; --s8:64px;
  --radius:10px; --radius-sm:7px; --radius-lg:14px;
  --shadow-sm:0 1px 2px rgba(15,29,43,.06);
  --shadow:0 1px 2px rgba(15,29,43,.06),0 8px 24px rgba(15,29,43,.06);
  --shadow-lg:0 2px 4px rgba(15,29,43,.06),0 24px 48px -12px rgba(15,29,43,.22);
  --maxw:1200px; --measure:70ch; --hdr:68px;
  --font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --serif:"Charter","Bitstream Charter","Iowan Old Style","Sitka Heading","Sitka Text",Cambria,"Noto Serif","DejaVu Serif",Georgia,serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
/* Тъмни променливи — един и същ блок за двата случая:
   1) изричен ръчен избор :root[data-theme="dark"] (печели винаги);
   2) авто по системата, но САМО без ръчен избор :root:not([data-theme]). */
:root[data-theme="dark"]{ --bg:#0b1219; --surface:#131c27; --surface-2:#18222e;
  --ink:#e8eef4; --ink-2:#c3d0dc; --muted:#9fb0c0; --faint:#7d8ea0;
  --line:#2c3947; --line-2:#212c38; --line-strong:#5f6b7a;
  --brand:#5aa3ea; --brand-ink:#8cc0f2; --brand-tint:#15283b;
  --navy:#08111b; --navy-2:#0f2132;
  --pos:#3ecf8e; --neg:#ef6b5e; --amber:#e0a83a;
  /* --alta/--media/--bassa НЕ се пипат: значките са с бял текст (WCAG AA) */
  --shadow-sm:0 1px 2px rgba(0,0,0,.35);
  --shadow:0 1px 3px rgba(0,0,0,.4),0 10px 28px rgba(0,0,0,.35);
  --shadow-lg:0 2px 6px rgba(0,0,0,.4),0 24px 48px -12px rgba(0,0,0,.6); }
@media (prefers-color-scheme:dark){
  :root:not([data-theme]){ --bg:#0b1219; --surface:#131c27; --surface-2:#18222e;
    --ink:#e8eef4; --ink-2:#c3d0dc; --muted:#9fb0c0; --faint:#7d8ea0;
    --line:#2c3947; --line-2:#212c38; --line-strong:#5f6b7a;
    --brand:#5aa3ea; --brand-ink:#8cc0f2; --brand-tint:#15283b;
    --navy:#08111b; --navy-2:#0f2132;
    --pos:#3ecf8e; --neg:#ef6b5e; --amber:#e0a83a;
    --shadow-sm:0 1px 2px rgba(0,0,0,.35);
    --shadow:0 1px 3px rgba(0,0,0,.4),0 10px 28px rgba(0,0,0,.35);
    --shadow-lg:0 2px 6px rgba(0,0,0,.4),0 24px 48px -12px rgba(0,0,0,.6); }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:calc(var(--hdr) + 12px)}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);
  line-height:1.6;font-size:16px;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  font-feature-settings:"kern"}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:2px}
/* връзките ВЪТРЕ в текст: траен приглушен подчертан щрих (WCAG 1.4.1 — не само цвят) */
:where(main p,main figcaption,main .d,main .note,main dd,.f-src,.f-bot>span) a:not(.btn):not(.chip){
  text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px;
  text-decoration-color:color-mix(in srgb,currentColor 40%,transparent)}
:where(main p,main figcaption,main .d,main .note,main dd,.f-src,.f-bot>span) a:not(.btn):not(.chip):hover{text-decoration-color:currentColor}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:3px}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
.sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* ---------- Горна лента (институционален подпис + бързи действия) ---------- */
.topbar{background:var(--navy);color:var(--on-navy-2);font-size:13px;line-height:1.3}
.topbar .wrap{display:flex;align-items:center;gap:8px 24px;min-height:36px;flex-wrap:wrap}
.topbar p{margin:0;max-width:none}
.topbar ul{display:flex;gap:2px 18px;list-style:none;margin:0 0 0 auto;padding:0}
.topbar a{color:var(--on-navy);font-weight:500}
.topbar a:hover{color:#fff}
.topbar :focus-visible{outline-color:#fff}

/* ---------- Masthead ---------- */
header.site{background:color-mix(in srgb,var(--surface) 94%,transparent);
  -webkit-backdrop-filter:saturate(1.6) blur(12px);backdrop-filter:saturate(1.6) blur(12px);
  border-bottom:1px solid var(--line);position:sticky;top:0;z-index:30;transition:box-shadow .2s}
header.site.scrolled{box-shadow:0 6px 20px -10px rgba(15,29,43,.25)}
header.site>.wrap{display:flex;align-items:center;gap:8px 20px;min-height:var(--hdr);position:static}
.brand{display:inline-flex;align-items:center;line-height:0;flex:none;margin-right:8px}
.brand-logo{height:42px;width:auto;display:block}
/* тъмна тема: тъмносиният надпис на логото иска светла подложка */
:root[data-theme="dark"] .brand{background:#eef3f9;border-radius:9px;padding:4px 10px}
@media (prefers-color-scheme:dark){
  :root:not([data-theme]) .brand{background:#eef3f9;border-radius:9px;padding:4px 10px}
}
nav.main{display:flex;align-items:center;gap:8px 12px;flex:1;min-width:0}
.nav-l{display:flex;align-items:stretch;gap:2px;list-style:none;margin:0;padding:0}
.nav-b{font:inherit;font-size:15px;font-weight:600;color:var(--ink-2);background:none;border:0;cursor:pointer;
  display:inline-flex;align-items:center;gap:6px;padding:10px 12px;border-radius:var(--radius-sm);
  position:relative;white-space:nowrap;transition:background-color .15s,color .15s}
.nav-b svg{width:14px;height:14px;flex:none;transition:transform .2s}
.nav-b:hover{background:var(--brand-tint);color:var(--brand-ink)}
.nav-b[aria-expanded="true"]{background:var(--brand-tint);color:var(--brand-ink)}
.nav-b[aria-expanded="true"] svg{transform:rotate(180deg)}
/* група с текущата страница: трайна черта отдолу (не само цвят) */
.nav-g.on>.nav-b{color:var(--brand-ink)}
.nav-g.on>.nav-b::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;
  border-radius:2px;background:var(--brand)}
/* Панелът на мега-менюто: на цялата ширина под masthead-а */
.nav-p{display:none;position:absolute;left:0;right:0;top:100%;background:var(--surface);
  border-top:1px solid var(--line);border-bottom:1px solid var(--line);box-shadow:var(--shadow-lg)}
.nav-b[aria-expanded="true"]+.nav-p{display:block;animation:np-in .18s ease-out}
@keyframes np-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.nav-pi{max-width:var(--maxw);margin:0 auto;padding:28px 24px 30px;
  display:grid;grid-template-columns:minmax(200px,1fr) 3fr;gap:24px 40px}
.nav-pt{margin:0}
.nav-pt b{display:block;font-family:var(--serif);font-size:22px;font-weight:700;line-height:1.2;color:var(--ink);margin-bottom:8px}
.nav-pt span{color:var(--muted);font-size:14.5px;line-height:1.5;display:block}
.nav-pt a{display:inline-block;margin-top:14px;font-size:14.5px;font-weight:600}
.nav-items{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:4px 16px}
.nav-items a{display:block;padding:10px 12px;border-radius:var(--radius-sm);color:var(--ink);
  border-left:2px solid transparent;transition:background-color .12s,border-color .12s}
.nav-items a:hover{background:var(--surface-2);border-left-color:var(--brand);text-decoration:none}
.nav-items a[aria-current]{background:var(--brand-tint);border-left-color:var(--brand)}
.ni-t{display:block;font-weight:600;font-size:15px;line-height:1.3}
.ni-d{display:block;color:var(--muted);font-size:13.5px;line-height:1.4;margin-top:2px}
/* търсене в masthead-а: comune / ospedale → dove.html?q= */
.nav-s{margin-left:auto;display:flex;align-items:center;position:relative;flex:0 1 270px;min-width:180px}
.nav-s input{font:inherit;font-size:14.5px;width:100%;height:40px;padding:0 40px 0 14px;
  border:1px solid var(--line-strong);border-radius:999px;background:var(--surface-2);color:var(--ink)}
.nav-s input::placeholder{color:var(--muted);opacity:1}
.nav-s input:focus{outline:none;border-color:var(--brand);background:var(--surface);box-shadow:0 0 0 3px var(--brand-tint)}
.nav-s button{position:absolute;right:3px;top:3px;width:34px;height:34px;border:0;border-radius:50%;
  background:var(--brand);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.nav-s button svg{width:16px;height:16px}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;
  width:42px;height:42px;padding:0;flex:none;background:transparent;
  border:1px solid var(--line-strong);border-radius:var(--radius-sm);
  color:var(--ink);cursor:pointer;transition:background-color .15s,border-color .15s}
.icon-btn:hover{background:var(--brand-tint);border-color:var(--brand)}
.icon-btn svg{display:block;width:20px;height:20px;pointer-events:none}
.nav-toggle{display:none}
.nav-toggle .ico-close{display:none}
.nav-toggle[aria-expanded="true"]{background:var(--brand-tint);border-color:var(--brand)}
.nav-toggle[aria-expanded="true"] .ico-open{display:none}
.nav-toggle[aria-expanded="true"] .ico-close{display:block}
/* слънце/луна следват ЕФЕКТИВНАТА тема през CSS (без грешна икона при първия paint) */
.theme-toggle .ico-sun{display:none}
:root[data-theme="dark"] .theme-toggle .ico-moon{display:none}
:root[data-theme="dark"] .theme-toggle .ico-sun{display:block}
@media(prefers-color-scheme:dark){
  :root:not([data-theme]) .theme-toggle .ico-moon{display:none}
  :root:not([data-theme]) .theme-toggle .ico-sun{display:block}
}
/* Без JS: панелите се отварят с hover/фокус (менюто остава достъпно) */
html:not(.js) .nav-g:hover>.nav-p,html:not(.js) .nav-g:focus-within>.nav-p{display:block}

/* ---------- Тесни екрани: чекмедже с акордеон ---------- */
@media(max-width:1080px){
  :root{--hdr:60px}
  .topbar p{display:none}
  .topbar ul{margin:0 auto 0 0;font-size:12.5px}
  header.site>.wrap{flex-wrap:wrap;gap:0 8px;padding-top:8px;padding-bottom:8px;min-height:var(--hdr)}
  .brand{margin-right:auto}
  .brand-logo{height:34px}
  .nav-toggle{display:inline-flex}
  nav.main{display:none;order:9;flex-basis:100%;flex-direction:column;align-items:stretch;gap:0;
    margin-top:8px;padding-top:12px;border-top:1px solid var(--line);
    max-height:calc(100vh - 120px);max-height:calc(100dvh - 120px);overflow-y:auto;overscroll-behavior:contain}
  nav.main.open{display:flex}
  .nav-s{order:-1;flex:none;width:100%;margin:0 0 8px}
  .nav-s input{height:46px;font-size:16px}
  .nav-s button{width:40px;height:40px}
  .nav-l{flex-direction:column}
  .nav-g{border-bottom:1px solid var(--line-2)}
  .nav-b{width:100%;justify-content:space-between;font-size:16.5px;min-height:52px;padding:12px 6px}
  .nav-b svg{width:18px;height:18px}
  .nav-g.on>.nav-b::after{display:none}
  .nav-p{position:static;box-shadow:none;border:0;background:transparent}
  .nav-b[aria-expanded="true"]+.nav-p{animation:none}
  .nav-pi{display:block;padding:0 0 12px}
  .nav-pt{display:none}
  .nav-items{grid-template-columns:1fr;gap:2px}
  .nav-items a{padding:10px 12px;min-height:44px}
  .ni-d{font-size:13px}
  html:not(.js) nav.main{display:flex}
  html:not(.js) .nav-p{display:block}
}
@media(max-width:480px){.wrap{padding:0 16px}}

main{padding:var(--s7) 0 var(--s7)}

/* ---------- Типографска скала ---------- */
h1,h2{font-family:var(--serif);font-weight:700;color:var(--ink)}
h1{font-size:clamp(30px,1.3rem + 2.2vw,48px);line-height:1.1;letter-spacing:-.015em;
  margin:0 0 var(--s4);max-width:24ch;text-wrap:balance}
h2{font-size:clamp(22px,1.15rem + .7vw,28px);line-height:1.2;letter-spacing:-.01em;
  margin:var(--s8) 0 var(--s4);padding-bottom:var(--s3);border-bottom:1px solid var(--line);text-wrap:balance}
h3{font-size:17.5px;line-height:1.3;margin:var(--s5) 0 var(--s3);font-weight:650;letter-spacing:-.005em}
p{max-width:var(--measure)}
.lead{color:var(--ink-2);font-size:clamp(17px,1rem + .35vw,20px);line-height:1.6;
  max-width:64ch;margin:0 0 var(--s4)}
strong{font-weight:650}

/* ---------- Карти / решетка ---------- */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
  box-shadow:var(--shadow-sm);padding:var(--s5)}
a.card{display:block;color:var(--ink);transition:border-color .15s,box-shadow .15s}
a.card:hover{border-color:var(--brand);box-shadow:var(--shadow);text-decoration:none}
.grid{display:grid;gap:var(--s4)}
.kpis{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.kpi{display:flex;flex-direction:column-reverse;justify-content:flex-end;gap:8px;padding:20px 22px;
  position:relative;overflow:hidden}
.kpi .n{font-size:clamp(24px,1.35rem + .8vw,32px);font-weight:700;letter-spacing:-.02em;
  line-height:1.05;font-variant-numeric:tabular-nums lining-nums;color:var(--ink)}
.kpi .l{color:var(--muted);font-size:13.5px;font-weight:550;line-height:1.35}
.kpi .n.neg{color:var(--neg)} .kpi .n.pos{color:var(--pos)}
.kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--line)}
.kpi:has(.n.neg)::before{background:var(--neg)} .kpi:has(.n.pos)::before{background:var(--pos)}

/* ---------- Таблици ---------- */
table{border-collapse:collapse;width:100%;font-size:14.5px}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);
  background:var(--surface);box-shadow:var(--shadow-sm)}
th,td{padding:11px 14px;text-align:left;border-bottom:1px solid var(--line-2);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
th{background:var(--surface-2);font-size:13px;font-weight:650;color:var(--ink-2);
  position:sticky;top:0;white-space:nowrap;border-bottom:1px solid var(--line)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums lining-nums;white-space:nowrap}
tbody tr:nth-child(even){background:color-mix(in srgb,var(--surface) 100%,var(--ink) 2.5%)}
tbody tr:hover{background:var(--brand-tint)}
/* връзки в клетки — траен приглушен подчертан щрих (не разчита само на цвят) */
td a{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px;
  text-decoration-color:color-mix(in srgb,var(--brand) 32%,transparent)}
td a:hover{text-decoration-color:var(--brand)}
td a.chip,td a.badge{text-decoration:none}
.neg{color:var(--neg)} .pos{color:var(--pos)}

/* ---------- Значки, чипове, бутони ---------- */
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:650;
  line-height:1.5;color:#fff;white-space:nowrap;letter-spacing:.01em}
.badge.alta{background:var(--alta)} .badge.media{background:var(--media)} .badge.bassa{background:var(--bassa)}
.chip{display:inline-block;padding:6px 13px;border:1px solid var(--line);border-radius:999px;
  font-size:13.5px;font-weight:550;color:var(--ink-2);background:var(--surface);
  transition:border-color .15s,background-color .15s}
.chip:hover{border-color:var(--brand);background:var(--brand-tint);color:var(--brand-ink);text-decoration:none}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 20px;
  border-radius:var(--radius-sm);font-weight:650;font-size:15.5px;border:1px solid var(--brand);
  background:var(--brand);color:#fff;transition:filter .15s,background-color .15s}
.btn:hover{filter:brightness(1.08);text-decoration:none}
.btn.ghost{background:transparent;color:var(--brand-ink);border-color:var(--line-strong)}
.btn.ghost:hover{background:var(--brand-tint);border-color:var(--brand);filter:none}
:root[data-theme="dark"] .btn:not(.ghost){color:#08223d}
@media(prefers-color-scheme:dark){:root:not([data-theme]) .btn:not(.ghost){color:#08223d}}

/* ---------- Сигнали ---------- */
.seg{border:1px solid var(--line);border-left:4px solid var(--bassa);border-radius:var(--radius-sm);
  background:var(--surface);padding:14px 18px;margin:var(--s3) 0;box-shadow:var(--shadow-sm)}
.seg.alta{border-left-color:var(--alta)} .seg.media{border-left-color:var(--media)}
.seg .t{font-weight:650;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.seg .d{color:var(--muted);font-size:14.5px;margin-top:5px;max-width:var(--measure)}

/* ---------- Форма / контроли ---------- */
.controls{display:flex;gap:10px;flex-wrap:wrap;margin:var(--s5) 0}
.controls input,.controls select{font:inherit;padding:10px 14px;border:1px solid var(--line-strong);
  border-radius:var(--radius-sm);background:var(--surface);color:var(--ink);min-width:0;min-height:44px}
.controls input:focus,.controls select:focus{outline:none;border-color:var(--brand);
  box-shadow:0 0 0 3px var(--brand-tint)}
.controls input[type=search]{flex:1;min-width:220px}
.controls button{font:inherit;padding:10px 18px;border:1px solid var(--brand);border-radius:var(--radius-sm);
  background:var(--brand);color:#fff;cursor:pointer;font-weight:650;transition:filter .15s;min-height:44px}
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
/* .note: информативна бележка — синкав тон с черта вляво (не предупреждение) */
.note{background:color-mix(in srgb,var(--surface) 100%,var(--brand) 5%);
  border:1px solid color-mix(in srgb,var(--line) 100%,var(--brand) 18%);border-left:3px solid var(--brand);
  border-radius:var(--radius-sm);padding:14px 18px;font-size:15px;color:var(--ink);
  max-width:var(--measure)}
.note strong{color:var(--ink)}
details.note{padding:0}
details.note>summary{cursor:pointer;list-style:none;padding:14px 18px;font-weight:650;
  display:flex;align-items:center;gap:10px}
details.note>summary::-webkit-details-marker{display:none}
details.note>summary::before{content:"";flex:none;width:8px;height:8px;margin-left:2px;
  border-right:2px solid var(--brand);border-bottom:2px solid var(--brand);transform:rotate(-45deg);transition:transform .2s}
details.note[open]>summary::before{transform:rotate(45deg)}
details.note>:not(summary){margin-left:18px;margin-right:18px}
details.note[open]{padding-bottom:6px}
.note+.note,details.note+details.note{margin-top:var(--s3)}
.note+.grid,details.note+.grid{margin-top:var(--s5)}
.grid+.note,.grid+details.note,.grid+.seg{margin-top:var(--s4)}
.hidden{display:none!important}
.skip{position:absolute;left:-9999px;top:0;background:var(--brand);color:#fff;padding:10px 16px;border-radius:0 0 8px 0;z-index:40;font-weight:600}
.skip:focus{left:0}

/* ---------- Графики ---------- */
figure.chart{margin:0}
figure.chart figcaption{color:var(--muted);font-size:13px;margin-top:8px;line-height:1.45;max-width:var(--measure)}
.hbars{display:flex;flex-direction:column;gap:10px;margin:var(--s2) 0}
.hbar-row{display:grid;grid-template-columns:minmax(120px,1.4fr) 3fr minmax(120px,auto);gap:12px;align-items:center;font-size:13.5px}
.hbar-l{color:var(--ink)} .hbar-row.flag .hbar-l{font-weight:650}
.hbar-track{background:color-mix(in srgb,var(--surface) 100%,var(--ink) 7%);border-radius:4px;height:12px;overflow:hidden}
.hbar-fill{height:100%;border-radius:4px}
.hbar-v{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
@media(max-width:640px){.hbar-row{grid-template-columns:1fr;gap:2px}.hbar-v{text-align:left}}
/* САМО за графиките (.chart) — глобален selector би бил етикетите на картата */
.chart svg .grid-line{stroke:var(--line)} .chart svg text{fill:var(--muted);font-size:11px}

/* ---------- Footer ---------- */
footer.site{background:var(--navy);color:var(--on-navy-2);font-size:14px;line-height:1.55;
  padding:var(--s7) 0 var(--s5);margin-top:var(--s7)}
footer.site a{color:var(--on-navy)}
footer.site a:hover{color:#fff}
footer.site :focus-visible{outline-color:#fff}
.f-top{display:grid;grid-template-columns:minmax(220px,1.3fr) 3fr;gap:var(--s6) var(--s7);
  padding-bottom:var(--s6);border-bottom:1px solid var(--navy-2)}
.f-brand b{display:block;font-family:var(--serif);font-size:22px;color:#fff;margin-bottom:10px}
.f-brand p{margin:0 0 10px}
.f-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--s5)}
.f-cols p{margin:0 0 10px;color:#fff;font-weight:650;font-size:14.5px}
.f-cols ul{list-style:none;margin:0;padding:0}
.f-cols li{margin:0 0 7px}
.f-src{padding:var(--s5) 0;border-bottom:1px solid var(--navy-2);font-size:13px}
.f-src p{margin:0 0 8px;max-width:110ch}
.f-bot{display:flex;flex-wrap:wrap;gap:8px 24px;align-items:center;padding-top:var(--s4);font-size:13px}
.f-bot ul{display:flex;flex-wrap:wrap;gap:4px 18px;list-style:none;margin:0 0 0 auto;padding:0}
@media(max-width:900px){.f-top{grid-template-columns:1fr}.f-cols{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:480px){.f-cols{grid-template-columns:1fr}.f-bot ul{margin:0}}
.backlink{display:inline-flex;align-items:center;min-height:32px;margin-bottom:var(--s3);font-size:14px;font-weight:550}

/* ---------- Pagella: цветни точки-спии (verde/giallo/rosso/nd) ----------
   Не разчитаме само на цвят: всяка точка носи title + aria-label с текст. */
.dot{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:4px;
  vertical-align:-2px;border:1px solid rgba(0,0,0,.15)}
.dot.verde{background:var(--pos)}
.dot.giallo{background:var(--amber)}
.dot.rosso{background:var(--neg)}
.dot.nd{background:transparent;border:1.5px dashed var(--faint)}
td.sem{white-space:nowrap}
.semrow{display:flex;flex-wrap:wrap;gap:6px 14px;margin:12px 0 0;align-items:center}
.semrow .semitem{display:inline-flex;align-items:center;gap:5px;font-size:13.5px;color:var(--muted)}

/* ---------- Мобилно: touch таргети ≥44px ---------- */
@media(max-width:640px){
  .chip{padding:9px 14px}
  .backlink{min-height:44px}
}

/* ---------- Печат: само съдържанието ---------- */
@media print{
  .topbar,header.site,footer.site,.skip,.hero-s,.hero-a{display:none!important}
  body{background:#fff;color:#000}
  .card,.tablewrap,.conto{box-shadow:none}
  main{padding:0}
}

/* ---------- Достъпност: намалено движение ---------- */
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;
    animation-delay:0s!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
}
`;

/**
 * Минимизира CSS за вграждане: маха коментарите и излишните празни места.
 * Безопасно за нашия CSS (без низове/url() с „/*“ вътре).
 * @param {string} css
 * @returns {string}
 */
export function minCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

export const CSS = minCss(CSS_SRC);

// CSS само за началната страница (hero + счетоводният регистър) — не тежи на
// останалите ~5000 страници. Вгражда се през page({ css }) като втори <style>.
export const CSS_HOME = minCss(`
/* ---------- Начална страница: „Il conto“ (счетоводният регистър) ---------- */
.hero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:var(--s7);align-items:start;
  padding-bottom:var(--s6)}
.hero h1{font-size:clamp(34px,1.4rem + 3vw,58px);max-width:15ch;margin-bottom:var(--s5)}
.hero .lead{max-width:56ch}
.hero-s{display:flex;gap:8px;max-width:560px;margin:var(--s5) 0 var(--s4)}
.hero-s input{flex:1;min-width:0;font:inherit;font-size:16.5px;height:54px;padding:0 18px;
  border:1px solid var(--line-strong);border-radius:var(--radius);background:var(--surface);color:var(--ink);box-shadow:var(--shadow-sm)}
.hero-s input::placeholder{color:var(--muted);opacity:1}
.hero-s input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px var(--brand-tint)}
.hero-s .btn{height:54px;border-radius:var(--radius)}
.hero-a{display:flex;flex-wrap:wrap;gap:10px}
.conto{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow);
  padding:26px 28px 22px;margin:0;font-variant-numeric:tabular-nums lining-nums}
.conto-h{display:flex;justify-content:space-between;align-items:baseline;gap:12px;
  padding-bottom:14px;margin-bottom:6px;border-bottom:1px solid var(--line)}
.conto-h b{font-family:var(--serif);font-size:20px;line-height:1.2}
.conto-h span{color:var(--muted);font-size:13.5px;white-space:nowrap}
.conto dl{margin:0}
.conto .r{display:flex;align-items:baseline;gap:10px;padding:9px 0}
.conto dt{color:var(--ink-2);font-size:15px;display:flex;align-items:baseline;flex:1;min-width:0}
/* puntini di guida: la riga si legge come in un libro contabile */
.conto dt::after{content:"";flex:1;margin:0 0 0 10px;border-bottom:1px dotted var(--line-strong);transform:translateY(-4px)}
.conto dd{margin:0;font-weight:650;font-size:16px;white-space:nowrap;text-align:right}
/* la doppia riga contabile sopra il totale: l'unico gesto «forte» della pagina */
.conto .tot{border-top:3px double var(--ink);margin-top:8px;padding-top:14px}
.conto .tot dt{font-weight:650;color:var(--ink)}
.conto .tot dd{font-size:clamp(24px,1.2rem + 1vw,30px);font-weight:750;letter-spacing:-.02em}
.conto-p{margin-top:16px;padding-top:14px;border-top:1px solid var(--line-2)}
.conto-p p{margin:0 0 8px;font-size:14.5px;color:var(--ink-2)}
.conto-bar{height:8px;border-radius:4px;background:color-mix(in srgb,var(--surface) 100%,var(--ink) 9%);overflow:hidden}
.conto-bar i{display:block;height:100%;background:var(--neg);border-radius:4px}
.conto figcaption{margin-top:14px;font-size:12.5px;color:var(--muted);line-height:1.45}
@media(prefers-reduced-motion:no-preference){
  .conto .r,.conto-p{animation:conto-in .5s cubic-bezier(.2,.7,.2,1) both}
  .conto .r:nth-child(2){animation-delay:.08s} .conto .r:nth-child(3){animation-delay:.16s}
  .conto .r:nth-child(4){animation-delay:.3s} .conto-p{animation-delay:.42s}
  .conto-bar i{animation:conto-bar .9s .5s cubic-bezier(.2,.7,.2,1) both}
}
@keyframes conto-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes conto-bar{from{transform:scaleX(0);transform-origin:left}to{transform:scaleX(1);transform-origin:left}}
@media(max-width:900px){.hero{grid-template-columns:1fr;gap:var(--s6)}}
/* percorsi: tre ingressi con un verbo ciascuno */
.percorsi{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:var(--s5) 0 0;
  border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface);overflow:hidden;list-style:none;padding:0}
.percorsi li+li{border-left:1px solid var(--line)}
.percorsi a{display:block;height:100%;padding:24px 26px;color:var(--ink);transition:background-color .15s}
.percorsi a:hover{background:var(--brand-tint);text-decoration:none}
.percorsi b{display:block;font-family:var(--serif);font-size:20px;line-height:1.25;margin-bottom:6px;color:var(--brand-ink)}
.percorsi span{display:block;color:var(--muted);font-size:14.5px;line-height:1.5}
@media(max-width:800px){.percorsi{grid-template-columns:1fr}.percorsi li+li{border-left:0;border-top:1px solid var(--line)}}
.statstrip{display:flex;flex-wrap:wrap;gap:12px 36px;margin:var(--s5) 0;padding:18px 22px;
  background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);font-variant-numeric:tabular-nums}
.statstrip div{display:flex;flex-direction:column;gap:2px}
.statstrip b{font-size:22px;letter-spacing:-.01em;line-height:1.1}
.statstrip span{color:var(--muted);font-size:13.5px}

@media(max-width:640px){
  .hero-s{flex-direction:column}
  .hero-s input{flex:none;width:100%}
  .hero-a .btn{flex:1 1 100%}
}
`);

/**
 * @typedef {object} NavGroup група от мега-менюто
 * @property {string} id
 * @property {string} label
 * @property {string} intro изречение за панела
 * @property {[string, string]|null} all връзка „всичко“ [href, текст]
 * @property {[string, string, string][]} items [href, заглавие, описание]
 */

/** Мега-менюто — единственият източник и за footer-а. @type {NavGroup[]} */
export const NAV_GROUPS = [
  {
    id: 'esplora',
    label: 'Esplora',
    intro: 'Parti da un luogo, da un’azienda sanitaria o da un fornitore.',
    all: ['strutture.html', 'Elenco completo delle strutture'],
    items: [
      ['dove.html', 'Trova la tua struttura', 'Dal tuo comune alla scheda dei conti'],
      ['strutture.html', 'Tutte le strutture', 'Le aziende del SSN, bilancio per bilancio'],
      ['regioni.html', 'Regioni a confronto', 'La carta d’Italia della spesa e delle gare'],
      ['fornitori.html', 'Fornitori', 'Chi incassa i soldi della sanità'],
      ['confronta.html', 'Confronta due aziende', 'Due bilanci fianco a fianco'],
      ['pagella.html', 'La pagella', 'Tutte le spie in un colpo d’occhio'],
      ['cerca.html', 'Cerca negli appalti', 'Per oggetto, fornitore e importo'],
    ],
  },
  {
    id: 'inchieste',
    label: 'Inchieste',
    intro: 'Le anomalie che emergono dai dati ufficiali: indicatori da verificare, non accuse.',
    all: ['storie.html', 'Le storie nei dati'],
    items: [
      ['inchiesta.html', 'Dove vanno i soldi', 'Il deficit del sistema e le spese anomale'],
      ['segnalazioni.html', 'Segnalazioni', 'Anomalie contabili, struttura per struttura'],
      ['conflitti.html', 'Relazioni ricorrenti', 'Coppie azienda–fornitore da verificare'],
      ['cordate.html', 'Le cordate', 'Chi concorre sempre insieme e chi non vince mai'],
      ['classifiche.html', 'Classifiche', 'Chi spende di più, voce per voce'],
      ['fine-anno.html', 'La febbre di dicembre', 'Gli affidamenti di fine anno'],
    ],
  },
  {
    id: 'spesa',
    label: 'Appalti e spesa',
    intro: 'Gare, pagamenti e voci di spesa della sanità pubblica, tema per tema.',
    all: ['approfondimenti.html', 'Tutti gli approfondimenti'],
    items: [
      ['appalti.html', 'Appalti', 'Quanto si compra senza gara, per regione e azienda'],
      ['segnali-gare.html', 'I semafori delle gare', 'Gli indicatori di rischio negli appalti'],
      ['aggiudicazioni.html', 'Chi partecipa alle gare', 'Offerenti, ribassi e ritardi'],
      ['top-contratti.html', 'I 100 contratti più grandi', 'Dove si concentra la spesa'],
      ['categorie.html', 'Categorie di spesa', 'Farmaci, pulizie, energia e altro'],
      ['pagamenti.html', 'Tempi di pagamento', 'Quanto in fretta pagano gli ospedali'],
    ],
  },
  {
    id: 'metodo',
    label: 'Dati e metodo',
    intro: 'Come calcoliamo ogni indicatore e come riusare i dati.',
    all: ['metodologia.html', 'Leggi la metodologia'],
    items: [
      ['metodologia.html', 'Metodologia', 'Fonti, formule e limiti di ogni indicatore'],
      ['dati.html', 'Dati aperti', 'Dataset JSON e CSV con licenza'],
      ['api.html', 'API', 'Endpoint stabili, senza chiavi'],
      ['verifiche.html', 'Dati e verifiche', 'Controlli di qualità e provenienza'],
      ['glossario.html', 'Glossario', 'CIG, GSA, affidamento diretto: le parole chiave'],
      ['aggiornamenti.html', 'Aggiornamenti', 'Cosa è cambiato e cosa arriva'],
    ],
  },
];

/** Бързите действия в горната лента. @type {[string, string][]} */
const TOPBAR = [
  ['guida-verifica.html', 'Come verificare un appalto'],
  ['segnalare.html', 'A chi segnalare'],
  ['feed.xml', 'RSS'],
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

const ICO_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const ICO_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

/**
 * Скриптът в <head> (анти-FOUC за темата + маркер `js`) и вграденият CSS.
 * Единственият blocking script — само за темата и класа `js`.
 * @returns {string}
 */
export function shellHead() {
  return `<script>document.documentElement.classList.add('js');try{var _t=localStorage.getItem('ost-theme');if(_t==='dark'||_t==='light')document.documentElement.dataset.theme=_t;}catch(e){}</script>
<style>${CSS}</style>`;
}

/**
 * Горна лента + masthead с мега-менюто. `current` е пътят на страницата (за
 * aria-current на точния елемент), `active` — резервният елемент от старото
 * едноредово меню (напр. профилите на изпълнителите → fornitori.html).
 * @param {{ rel?: string, current?: string|null, active?: string }} o
 * @returns {string}
 */
export function shellTop({ rel = '', current = null, active = '' }) {
  const tutti = NAV_GROUPS.flatMap((g) => g.items.map((i) => i[0]));
  const cur = current && tutti.includes(current) ? current : active;
  const gruppi = NAV_GROUPS.map((g) => {
    const on = g.items.some((i) => i[0] === cur);
    const items = g.items
      .map(
        ([href, t, d]) =>
          `<li><a href="${rel}${href}"${href === cur ? ' aria-current="page"' : ''}><span class="ni-t">${esc(t)}</span><span class="ni-d">${esc(d)}</span></a></li>`
      )
      .join('');
    const all = g.all ? `<a href="${rel}${g.all[0]}">${esc(g.all[1])}</a>` : '';
    return `<li class="nav-g${on ? ' on' : ''}"><button class="nav-b" type="button" aria-expanded="false" aria-controls="np-${g.id}">${esc(g.label)}${ICO_CHEV}</button><div class="nav-p" id="np-${g.id}"><div class="nav-pi"><p class="nav-pt"><b>${esc(g.label)}</b><span>${esc(g.intro)}</span>${all}</p><ul class="nav-items">${items}</ul></div></div></li>`;
  }).join('');
  const top = TOPBAR.map(([h, t]) => `<li><a href="${rel}${h}">${esc(t)}</a></li>`).join('');
  return `<a href="#contenuto" class="skip">Salta al contenuto</a>
<aside class="topbar" aria-label="Il progetto"><div class="wrap"><p>Progetto civico indipendente sui conti e gli appalti della sanità pubblica, da dati ufficiali.</p><ul>${top}</ul></div></aside>
<header class="site"><div class="wrap">
  <a class="brand" href="${rel}index.html" aria-label="Ospedali Trasparenti — home"><img class="brand-logo" src="${rel}logo.png" width="502" height="134" alt="Ospedali Trasparenti"></a>
  <nav class="main" id="nav-main" aria-label="Principale">
    <ul class="nav-l">${gruppi}</ul>
    <form class="nav-s" role="search" action="${rel}dove.html" method="get"><label class="sr" for="nav-q">Cerca il tuo comune o ospedale</label><input id="nav-q" name="q" type="search" placeholder="Comune o ospedale…" autocomplete="off" enterkeyhint="search"><button type="submit" aria-label="Cerca">${ICO_SEARCH}</button></form>
  </nav>
  <button class="icon-btn theme-toggle" type="button" aria-pressed="false" aria-label="Tema scuro" title="Tema chiaro / scuro">
    <svg class="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    <svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
  </button>
  <button class="icon-btn nav-toggle" type="button" aria-expanded="false" aria-controls="nav-main" aria-label="Apri il menu">
    <svg class="ico-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    <svg class="ico-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
  </button>
</div></header>`;
}

// Скриптовете на обвивката (минимизирани ръчно — коментарите са тук, в JS-а):
// • мега-меню: бутоните са disclosure (aria-expanded), само един панел отворен;
//   Escape затваря и връща фокуса, клик/фокус извън затваря;
// • мобилно чекмедже: hamburger, при отваряне се разгъва групата на текущата
//   страница; при излизане от мобилния изглед се затваря;
// • широките таблици, които реално скролират хоризонтално, стават фокусируеми
//   региони (WCAG 2.1.1 — скрол и от клавиатурата);
// • сянка на masthead-а при скрол (passive listener, без layout thrash);
// • тема светла⇄тъмна: записът в localStorage печели над системата.
const SHELL_JS = `(function(){
var d=document,h=d.querySelector('header.site'),n=d.getElementById('nav-main'),t=d.querySelector('.nav-toggle');
if(!h||!n)return;
var bs=[].slice.call(n.querySelectorAll('.nav-b')),mq=matchMedia('(max-width:1080px)');
function set(b,v){b.setAttribute('aria-expanded',v?'true':'false');}
function chiudiTutti(e){bs.forEach(function(b){if(b!==e)set(b,false);});}
bs.forEach(function(b){b.addEventListener('click',function(){var a=b.getAttribute('aria-expanded')==='true';if(!mq.matches)chiudiTutti(b);set(b,!a);});});
function apriD(){set(t,true);t.setAttribute('aria-label','Chiudi il menu');n.classList.add('open');var on=n.querySelector('.nav-g.on>.nav-b');if(on)set(on,true);}
function chiudiD(){set(t,false);t.setAttribute('aria-label','Apri il menu');n.classList.remove('open');}
if(t)t.addEventListener('click',function(){t.getAttribute('aria-expanded')==='true'?chiudiD():apriD();});
d.addEventListener('keydown',function(e){if(e.key!=='Escape')return;
  var o=bs.filter(function(b){return b.getAttribute('aria-expanded')==='true';})[0];
  if(o&&!mq.matches){set(o,false);o.focus();}else if(t&&t.getAttribute('aria-expanded')==='true'){chiudiD();t.focus();}});
d.addEventListener('click',function(e){if(h.contains(e.target))return;if(!mq.matches)chiudiTutti(null);else if(t&&t.getAttribute('aria-expanded')==='true')chiudiD();});
n.addEventListener('focusout',function(e){if(mq.matches)return;var r=e.relatedTarget;if(!r)return;bs.forEach(function(b){if(!b.parentNode.contains(r))set(b,false);});});
mq.addEventListener('change',function(){chiudiTutti(null);if(t)chiudiD();});
var us={};[].forEach.call(d.querySelectorAll('.tablewrap'),function(w){if(w.scrollWidth<=w.clientWidth+1||w.hasAttribute('tabindex'))return;
  var e=w.previousElementSibling;while(e&&!/^H[23]$/.test(e.tagName))e=e.previousElementSibling;
  var l='Tabella'+(e?': '+e.textContent.trim():'');us[l]=(us[l]||0)+1;if(us[l]>1)l+=' ('+us[l]+')';
  w.tabIndex=0;w.setAttribute('role','region');w.setAttribute('aria-label',l);});
var sc=false;addEventListener('scroll',function(){var v=scrollY>4;if(v!==sc){sc=v;h.classList.toggle('scrolled',v);}},{passive:true});
})();
(function(){
var t=document.querySelector('.theme-toggle');if(!t)return;
var mq=matchMedia('(prefers-color-scheme:dark)'),r=document.documentElement;
function eff(){return r.dataset.theme||(mq.matches?'dark':'light');}
function agg(){var s=eff()==='dark';t.setAttribute('aria-pressed',s?'true':'false');}
t.addEventListener('click',function(){var v=eff()==='dark'?'light':'dark';r.dataset.theme=v;try{localStorage.setItem('ost-theme',v);}catch(e){}agg();});
agg();mq.addEventListener('change',function(){if(!r.dataset.theme)agg();});
})();`;

/**
 * Footer (карта на сайта от NAV_GROUPS + източници + правни връзки) и скриптовете.
 * @param {{ rel?: string }} o
 * @returns {string}
 */
export function shellBottom({ rel = '' }) {
  const cols = NAV_GROUPS.map(
    (g) =>
      `<div><p>${esc(g.label)}</p><ul>${g.items.map(([h, tt]) => `<li><a href="${rel}${h}">${esc(tt)}</a></li>`).join('')}</ul></div>`
  ).join('');
  return `<footer class="site"><div class="wrap">
  <div class="f-top">
    <div class="f-brand"><b>Ospedali Trasparenti</b>
      <p>Conti e appalti delle strutture sanitarie pubbliche italiane, elaborati automaticamente da fonti ufficiali <em>open data</em>.</p>
      <p>Le segnalazioni e gli indicatori sono automatici, <strong>non accuse</strong>: richiedono verifica.</p></div>
    <nav class="f-cols" aria-label="Mappa del sito">${cols}</nav>
  </div>
  <div class="f-src"><p><strong>Fonti e licenze.</strong> Elaborazione propria su:
  <a href="https://dati.anticorruzione.it/opendata">ANAC — Banca Dati Nazionale dei Contratti Pubblici</a> (CC BY 4.0);
  <a href="https://openbdap.rgs.mef.gov.it/it/SSN/Analizza">BDAP — RGS/MEF</a>, modelli CE/SP del SSN (IODL 2.0);
  <a href="https://www.dati.salute.gov.it/">Ministero della Salute</a>. I dati sono stati aggregati, normalizzati ed
  elaborati; eventuali errori di elaborazione non sono imputabili ai titolari delle fonti.</p></div>
  <div class="f-bot"><span>Progetto di trasparenza civica senza scopo di lucro di <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a>. Non è una testata giornalistica.</span>
    <ul><li><a href="${rel}note-legali.html">Note legali</a></li><li><a href="${rel}privacy.html">Privacy</a></li><li><a href="${rel}accessibilita.html">Accessibilità</a></li><li><a href="${rel}feed.xml">RSS</a></li></ul></div>
</div></footer>
<script>${SHELL_JS}</script>`;
}

/**
 * Обвивка на страница. `rel` е префиксът за връзки (напр. '../' за детайлните).
 * `canonical` е релативният път на страницата спрямо корена (по подр. = `active`,
 * което е вярно за страниците от менюто). `jsonld` инжектира JSON-LD блок.
 * @param {PageOpts} opts
 * @returns {string}
 */
export function page({ title, active, rel = '', body, description = '', canonical = null, jsonld = null, ogType = 'website', noindex = false, keywords = [], css = '' }) {
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
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4f6f9">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b1219">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="${esc(keywordsPagina(keywords.length ? keywords : [title.split(' — ')[0]]).join(', '))}">
${meta}
${shellHead()}${css ? `\n<style>${css}</style>` : ''}
</head>
<body>
${shellTop({ rel, current: path && path !== '/' ? path : 'index.html', active })}
<main id="contenuto"><div class="wrap">
${body}
</div></main>
${shellBottom({ rel })}
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
