// 3D страницата — една на език (/staffe-3d, /en/brackets-3d, /bg/planki-3d). Това е визьорът от
// panev/3d в собствен документ, без site.css: класовете му (.list, .code, .tools…) се бият с тези
// на сайта. Маркировката и стилът идват от 3d/template.html, а бъндълът и текстурите — от 3d-viewer/
// (`cd 3d && npm run site`). Главата (canonical, hreflang, OG, JSON-LD) е тази на сайта.
// Рамката на началната страница е отделен документ (…-3d-embed): класът embed е в маркировката,
// защото скриптът идва след първото рисуване и горната лента иначе се вижда за миг.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { esc, head, pagePath, ORIGIN } from './layout.mjs';
import { versioned } from './asset.mjs';
import { COMPANY } from '../data/products.mjs';
import { strings } from '../../3d/src/ui/i18n.js';

const PANEV = new URL('../../', import.meta.url);
const TEMPLATE = readFileSync(new URL('3d/template.html', PANEV), 'utf8');
const BUNDLE = readFileSync(new URL('3d-viewer/staffe-3d.js', PANEV));
const VERSION = createHash('sha256').update(BUNDLE).digest('hex').slice(0, 10);

function between(text, from, to) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`3d/template.html: не намирам ${from} … ${to}`);
  return text.slice(a + from.length, b);
}
const STYLE = between(TEMPLATE, '<style>', '</style>');
const APP = between(TEMPLATE, '<body>', '<script type="module"').trim();

// Шрифтът на сайта (Inter от /fonts, със същите unicode-range) — визьорът изглежда като останалите
// страници. Правилата се взимат от css/site.css, за да няма второ копие.
const FONTS = (readFileSync(new URL('css/site.css', PANEV), 'utf8').match(/@font-face \{[^}]*\}/g) ?? [])
  .map((rule) => `\n  ${rule.replace(/\n\s*/g, ' ')}`).join('');
if (!FONTS) throw new Error('css/site.css: няма @font-face правила');

// Статичните текстове на template.html са на италиански; тук стават на езика на страницата, с
// логото на сайта като път обратно към началото. Превключвателят на езика също е в маркировката:
// горната лента е цяла от първото рисуване (не подскача, когато дойде скриптът), линковете работят
// и без JS, а ui.js им добавя изгледа. Всяка замяна трябва да хване точно едно място.
function localize(app, t, locales, embed) {
  const s = strings(t.lang);
  const langs = locales.map((lt) => `<a href="${pagePath(lt, 'viewer3d')}" hreflang="${lt.htmlLang}" lang="${lt.htmlLang}" title="${esc(lt.langNames[lt.lang])}"${lt.lang === t.lang ? ' aria-current="page"' : ''}>${lt.lang.toUpperCase()}</a>`).join('');
  const swaps = [
    // В рамката лентата е скрита: без логото (картинката иначе се тегли напразно).
    ...(embed ? [] : [['<header class="top">', `<header class="top">
    <a class="home" href="${pagePath(t, 'home')}"><img src="/img/panev-logo-darkmode.png" alt="${esc(COMPANY.name)}" width="170" height="44"></a>`]]),
    ['<h1 id="title">Staffe Panev in 3D</h1>', `<h1 id="title">${esc(s.title)}</h1>`],
    ['aria-label="Lingua"></div>', `aria-label="${esc(s.language)}">${langs}</div>`],
    ['aria-label="Catalogo 2026"', `aria-label="${esc(s.catalog)}"`],
    ['aria-label="Modello 3D"', `aria-label="${esc(s.canvas('').replace(/: $/, ''))}"`],
    ['>Caricamento del modello 3D…<', `>${esc(s.loading)}<`],
    ['aria-label="Controlli"', `aria-label="${esc(s.controls)}"`],
    ['>La vista 3D ha bisogno di JavaScript: attivalo nel browser.<', `>${esc(s.noscript)}<`],
  ];
  return swaps.reduce((html, [from, to]) => {
    if (html.split(from).length !== 2) throw new Error(`3d/template.html: „${from}“ трябва да е точно веднъж`);
    return html.replace(from, () => to);
  }, app);
}

// Уеб приложение без инсталиране и без цена: за търсачките и отговорните машини.
function appLd(t) {
  const s = strings(t.lang);
  return {
    '@type': 'WebApplication',
    name: s.title,
    description: s.description,
    url: `${ORIGIN}${pagePath(t, 'viewer3d')}`,
    inLanguage: t.htmlLang,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Any',
    browserRequirements: 'WebGPU / WebGL 2',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    publisher: { '@id': `${ORIGIN}/#organization` },
  };
}

// Класовете са в маркировката, не ги слага скриптът: booting (панелите се показват, когато изгледът
// е готов — без подскачане на телефон), embed (рамката). Сайтът е само светъл: 3D-то го следва и в
// рамката на началната страница (без тъмна тема). Езикът е по адреса (data-lang).
const htmlAttrs = (t, embed) => ` class="booting${embed ? ' embed' : ''}" data-lang="${t.lang}" data-theme="light"`;

// Рамката не е страница за търсачките: noindex, без canonical/hreflang/OG (те са на 3D страницата).
function embedHead(t) {
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}"${htmlAttrs(t, true)}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(strings(t.lang).title)}</title>
  <meta name="robots" content="noindex">
  <meta name="keywords" content="${esc(t.meta.viewer3d.keywords.join(', '))}">
  <style>${FONTS}${STYLE}</style>
</head>`;
}

export function viewerPage(t, locales, { embed = false } = {}) {
  const top = embed ? embedHead(t) : head(t, locales, 'viewer3d', {
    ogImage: versioned('img/og-3d.jpg'),
    ldExtra: [appLd(t)],
    htmlAttrs: htmlAttrs(t, false),
    viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
    styles: `<style>${FONTS}${STYLE}</style>`,
  });
  return `${top}
<body>
${localize(APP, t, locales, embed)}
<script type="module" src="/3d-viewer/staffe-3d.js?v=${VERSION}"></script>
</body>
</html>
`;
}
