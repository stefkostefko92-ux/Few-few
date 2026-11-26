// Инструкциите за монтаж във видео (собственикът, 26.11.2026): хъб с двата клипа и по една страница за всеки клип
// („watch page“: видеото е основното съдържание, най-горе, стъпките са текст под него — SEO, 26.11.2026).
// Плейърът е от YouTube, но се зарежда само при клик (правният преглед, 26.11.2026): дотогава на страницата има
// наша снимка, бутон и видимо известие (Google, IP, данни на устройството, САЩ) с линк към informativa#video.
// Без JS снимката е обикновен линк към YouTube. js/video.js сменя снимката с iframe от youtube-nocookie.com.
// Изборът не се помни: всеки клик е съгласие само за това видео.

import { esc, pagePath, crumbName, ORIGIN } from './layout.mjs';
import { versioned } from './asset.mjs';
import { orderCta } from './products.mjs';
import { CATALOG_PDF } from '../data/products.mjs';
import { VIDEOS, VIDEO_KEYS, VIDEO_OF_FAMILY } from '../data/videos.mjs';

export { VIDEO_KEYS, VIDEO_OF_FAMILY };
export const VIDEO_PAGE_KEYS = ['howto', ...VIDEO_KEYS];
// Пътеката: хъбът е под началото, всяко видео — под хъба.
export const VIDEO_PARENTS = { howto: [], vidDoors: ['howto'], vidGuides: ['howto'] };

const watchUrl = (v, at = 0) => `https://www.youtube.com/watch?v=${v.youtube}${at ? `&t=${at}s` : ''}`;
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const isoDuration = (s) => `PT${Math.floor(s / 60)}M${s % 60}S`;
// Печатната страница N е страница N + 1 на PDF-а (корицата е без номер).
const pdfPage = (n) => `${CATALOG_PDF}#page=${n + 1}`;
const pageUrl = (t, key) => `${ORIGIN}${pagePath(t, key)}`;
// Снимката за Google: стабилен адрес без ?v= (Google иска един и същ адрес за видеото).
export const thumbnailPath = (key) => `/img/video/${VIDEOS[key].poster}-1280.jpg`;
export const ogPath = (key) => versioned(`img/video/${VIDEOS[key].poster}-og.jpg`);

// Снимката на клипа (scripts/video-posters.mjs): WebP 480/960/1600 и JPEG 960, всичките 16:9.
export function poster(key, alt, { sizes, lazy = true, priority = false }) {
  const base = `img/video/${VIDEOS[key].poster}`;
  const webp = [480, 960, 1600].map((w) => `${versioned(`${base}-${w}.webp`)} ${w}w`).join(', ');
  return `<picture class="vposter">
  <source type="image/webp" srcset="${webp}" sizes="${sizes}">
  <img src="${versioned(`${base}-960.jpg`)}" alt="${esc(alt)}" width="960" height="540"${lazy ? ' loading="lazy" decoding="async"' : ''}${priority ? ' fetchpriority="high"' : ''}>
</picture>`;
}

// Фасадата: рамката 16:9 със снимката и бутона; известието е под рамката, преди клика (Google не позволява
// нищо върху самия плейър). Бутонът казва какво прави; линкът „Apri su YouTube“ е изборът без вграждане.
export function facade(t, key) {
  const v = VIDEOS[key];
  const sh = t.videos.shared;
  const title = t.videos[key].h1;
  return `<figure class="yt" data-yt="${v.youtube}" data-title="${esc(title)}">
    <div class="yt-frame">
      <a class="yt-poster" href="${watchUrl(v)}" target="_blank" rel="noopener">
        ${poster(key, t.videos[key].posterAlt, { sizes: '(max-width: 1100px) 100vw, 1040px', lazy: false, priority: true })}
        <span class="yt-play">${esc(sh.play)}</span>
        <span class="yt-dur">${clock(v.seconds)}</span>
      </a>
    </div>
    <figcaption class="yt-notice">${esc(sh.notice)} <a href="${pagePath(t, 'privacy')}#video">${esc(sh.privacyLink)}</a> · <a href="${watchUrl(v)}" target="_blank" rel="noopener">${esc(sh.openYoutube)}</a></figcaption>
  </figure>`;
}

// Карта към страницата на видеото (хъбът, началната страница, страниците на семействата): само линк, без плейър —
// там нищо не се зарежда от Google и известие не трябва.
export function videoCard(t, key, { headingLevel = 3 } = {}) {
  const v = VIDEOS[key];
  const g = t.videos[key];
  const sh = t.videos.shared;
  const h = `h${headingLevel}`;
  return `<article class="vcard">
      <a class="vcard-link" href="${pagePath(t, key)}">
        <span class="vcard-media">
          ${poster(key, g.posterAlt, { sizes: '(max-width: 760px) 100vw, 560px' })}
          <span class="vcard-play" aria-hidden="true"></span>
          <span class="yt-dur">${clock(v.seconds)}</span>
        </span>
        <span class="vcard-body">
          <${h} class="vcard-title">${esc(g.card)}</${h}>
          <span class="vcard-meta">${esc(v.codes)} · ${esc(sh.steps(g.steps.length))} · ${esc(sh.duration)} ${clock(v.seconds)}</span>
          <span class="vcard-cta">${esc(sh.watch)}</span>
        </span>
      </a>
    </article>`;
}

// Блокът с карти за другите страници: началната (двете видеа) и страниците на семействата (видеото им).
export function videoSection(t, keys, { tint = false } = {}) {
  const sh = t.videos.shared;
  return `
<section class="section${tint ? ' section-tint' : ''} vsection" id="video">
  <div class="wrap">
    <h2>${esc(sh.sectionTitle)}</h2>
    <p class="lead">${esc(sh.sectionLead)}</p>
    <div class="vcards${keys.length === 1 ? ' vcards-one' : ''}">
    ${keys.map((k) => videoCard(t, k)).join('\n    ')}
    </div>
    <p class="sec-more"><a href="${pagePath(t, 'howto')}">${esc(sh.hubLink)}</a></p>
  </div>
</section>`;
}

function crumbs(t, key) {
  const trail = ['home', ...VIDEO_PARENTS[key]].map((k) => `<a href="${pagePath(t, k)}">${esc(crumbName(t, k))}</a>`).join('<span aria-hidden="true"> › </span>');
  return `<nav class="crumbs" aria-label="${esc(t.videos.shared.crumbsLabel)}">${trail}<span aria-hidden="true"> › </span><span aria-current="page">${esc(crumbName(t, key))}</span></nav>`;
}

// ── Хъбът ────────────────────────────────────────────────────
export function hubPage(t) {
  const g = t.videos.howto;
  return `
<section class="page-head">
  <div class="wrap">
    ${crumbs(t, 'howto')}
    <p class="kicker kicker-light">${esc(g.kicker)}</p>
    <h1>${esc(g.h1)}</h1>
    <p class="sec-lead">${esc(g.lead)}</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <h2>${esc(g.listTitle)}</h2>
    <div class="vcards">
    ${VIDEO_KEYS.map((k) => videoCard(t, k)).join('\n    ')}
    </div>
  </div>
</section>

<section class="section section-tint">
  <div class="wrap">
    <h2>${esc(g.aboutTitle)}</h2>
    ${g.about.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}
    <p class="sec-more"><a href="${pagePath(t, 'catalog')}">${esc(t.nav.catalog)}</a> · <a href="${pagePath(t, 'viewer3d')}">${esc(t.nav.viewer3d)}</a> · <a href="${pagePath(t, 'walls')}">${esc(t.guides.walls.crumb)}</a></p>
  </div>
</section>

${orderCta(t)}`;
}

export const hubLd = (t) => [{
  '@type': 'ItemList',
  '@id': `${pageUrl(t, 'howto')}#videos`,
  name: t.videos.howto.h1,
  inLanguage: t.htmlLang,
  isPartOf: { '@id': `${pageUrl(t, 'howto')}#webpage` },
  itemListElement: VIDEO_KEYS.map((k, i) => ({ '@type': 'ListItem', position: i + 1, url: pageUrl(t, k), name: t.videos[k].h1 })),
}];

// ── Страницата на видеото ────────────────────────────────────
export function videoPage(t, key) {
  const v = VIDEOS[key];
  const g = t.videos[key];
  const sh = t.videos.shared;
  const steps = g.steps.map((s, i) => {
    const at = v.steps[i];
    return `
      <li class="vstep" id="passo-${i + 1}">
        <a class="vstep-time" href="${esc(watchUrl(v, at))}" data-yt-seek="${at}" target="_blank" rel="noopener" aria-label="${esc(sh.seekLabel(i + 1, clock(at)))}">${clock(at)}</a>
        <div>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.body)}</p>
        </div>
      </li>`;
  }).join('');
  const families = v.families.map((fam) => `<a href="${pagePath(t, fam)}">${esc(t.families[fam].crumb)}</a>`).join(' · ');
  const pages = v.pages.map((n) => `<a href="${pdfPage(n)}">${esc(sh.catalogPage(n))}</a>`).join(' · ');
  return `
<section class="page-head page-head-video">
  <div class="wrap">
    ${crumbs(t, key)}
    <p class="kicker kicker-light">${esc(g.kicker)}</p>
    <h1>${esc(g.h1)}</h1>
    <div class="chips">
      <span class="chip chip-light">${esc(sh.duration)} ${clock(v.seconds)}</span>
      <span class="chip chip-light">${esc(sh.steps(g.steps.length))}</span>
      <span class="chip chip-light">${esc(sh.sides)}</span>
      <span class="chip chip-light">${esc(sh.language)}</span>
    </div>
  </div>
</section>

<section class="section vwatch">
  <div class="wrap">
    ${facade(t, key)}
    <p class="lead vlead">${esc(g.lead)}</p>
  </div>
</section>
${videoScript()}

<section class="section section-tint" id="passi">
  <div class="wrap">
    <h2>${esc(sh.stepsTitle)}</h2>
    <p class="lead">${esc(sh.stepsLead)}</p>
    <ol class="vsteps">${steps}
    </ol>
    ${g.legend ? `<p class="note">${esc(g.legend)}</p>` : ''}
    <p class="note">${esc(t.guides.walls.stepsNote)}</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <h2>${esc(sh.productsTitle)}</h2>
    <p><strong>${esc(v.codes)}</strong> · ${families}</p>
    <p class="sec-more">${pages} · <a href="${pagePath(t, 'viewer3d')}">${esc(t.families.shared.see3d)}</a> · <a href="${pagePath(t, 'howto')}">${esc(sh.hubLink)}</a></p>
  </div>
</section>

${orderCta(t)}`;
}

// VideoObject + HowTo. Видеото е на италиански на всяка от трите страници (inLanguage на клипа), страницата и
// стъпките са на езика ѝ. Стъпките в HowTo са видимите, дума по дума, с котва към всяка.
export function videoLd(t, key) {
  const v = VIDEOS[key];
  const g = t.videos[key];
  const url = pageUrl(t, key);
  return [
    {
      '@type': 'VideoObject',
      '@id': `${url}#video`,
      name: g.h1,
      description: g.lead,
      thumbnailUrl: [`${ORIGIN}${thumbnailPath(key)}`],
      uploadDate: v.uploaded,
      duration: isoDuration(v.seconds),
      embedUrl: `https://www.youtube.com/embed/${v.youtube}`,
      inLanguage: 'it',
      publisher: { '@id': `${ORIGIN}/#organization` },
      creator: { '@type': 'Organization', name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' },
    },
    {
      '@type': 'HowTo',
      '@id': `${url}#howto`,
      url: `${url}#passi`,
      name: g.h1,
      description: `${g.lead} ${t.guides.walls.stepsNote}`,
      inLanguage: t.htmlLang,
      isPartOf: { '@id': `${url}#webpage` },
      video: { '@id': `${url}#video` },
      step: g.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.title, text: s.body, url: `${url}#passo-${i + 1}` })),
    },
  ];
}

// На страницата на видеото то е основното съдържание (WebPage.mainEntity), а снимката — главната ѝ снимка.
export const videoWebpage = (t, key) => ({
  mainEntity: { '@id': `${pageUrl(t, key)}#video` },
  primaryImageOfPage: { '@type': 'ImageObject', url: `${ORIGIN}${thumbnailPath(key)}`, width: 1280, height: 720 },
});

export const videoScript = () => `<script src="${versioned('js/video.js')}" defer></script>`;
