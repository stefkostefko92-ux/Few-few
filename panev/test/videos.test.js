'use strict';
// Видео страниците „Istruzioni di montaggio“ (собственикът, 26.11.2026): хъб + по една страница за всеки клип,
// YouTube се зарежда само след клик (фасада с наша снимка). Правният преглед (Правният Разбирач, 26.11.2026)
// поставя условията, а тестът ги пази върху генерираните страници:
//   • преди клика страницата не тегли нищо от Google: нито iframe, нито снимка, нито скрипт;
//   • известието за YouTube (Google, IP, данни на устройството, САЩ) се вижда до бутона, преди клика;
//   • informativa на трите езика казва истината: YouTube след клик, Google Ireland, DPF, без „няма банер“;
//   • CSP-то пуска в рамка само youtube-nocookie.com;
//   • данните за Google (VideoObject, HowTo) съвпадат с видимото: продължителност, дата, стъпки, времена.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://panevascensori.it';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const VIDEOS = {
  doors: { id: '0odeUp0MThM', duration: 'PT2M13S', uploaded: '2026-11-25', steps: [4, 13, 21, 30, 48, 55, 61, 67, 74, 84, 112] },
  guides: { id: 'qJVC75MQlM0', duration: 'PT1M45S', uploaded: '2026-11-26', steps: [4, 12, 23, 30, 44, 59, 69, 74, 83] },
};
// Адресите на трите езика: хъбът, вратите, водачите, плюс страниците на семействата, които водят към видеата.
const SLUGS = {
  it: { base: '', hub: 'istruzioni-montaggio', doors: 'montaggio-staffe-porte-di-piano', guides: 'montaggio-guide-contrappeso',
    famDoors: 'staffe-porte-di-piano', famGuides: 'supporti-guide-contrappeso', famSg: 'staffe-guida-sg', privacy: 'privacy' },
  en: { base: '/en', hub: 'installation-instructions', doors: 'landing-door-bracket-installation', guides: 'counterweight-guide-bracket-installation' },
  bg: { base: '/bg', hub: 'instruktsii-za-montazh', doors: 'montazh-planki-etazhni-vrati', guides: 'montazh-vodachi-protivotezhest' },
};
const LANGS = Object.keys(SLUGS);
const PRIVACY = { it: 'privacy', en: 'privacy', bg: 'poveritelnost' };
const fileOf = (lang, slug) => path.join(ROOT, SLUGS[lang].base.replace(/^\//, ''), `${slug}.html`);
const urlOf = (lang, slug) => `${SLUGS[lang].base}/${slug}`;
const doc = (lang, key) => fs.readFileSync(fileOf(lang, SLUGS[lang][key]), 'utf8');
const sitemap = read('sitemap.xml');
const allPages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => !u.endsWith('.pdf'))
  .map((u) => { const p = u.slice(ORIGIN.length); return path.join(ROOT, p.endsWith('/') ? `${p}index.html` : `${p}.html`); });
const graphOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap((m) => JSON.parse(m[1])['@graph'] ?? []);
const figures = (html) => [...html.matchAll(/<figure class="yt"[\s\S]*?<\/figure>/g)].map((m) => m[0]);

test('видео страниците съществуват на трите езика и са в sitemap-а', () => {
  for (const lang of LANGS) {
    for (const key of ['hub', 'doors', 'guides']) {
      assert.ok(fs.existsSync(fileOf(lang, SLUGS[lang][key])), `${lang}/${key}: няма файл`);
      assert.ok(sitemap.includes(`<loc>${ORIGIN}${urlOf(lang, SLUGS[lang][key])}</loc>`), `${lang}/${key}: не е в sitemap-а`);
    }
  }
});

test('никоя страница не тегли нищо от трета страна преди клик (src, srcset, iframe, скрипт)', () => {
  for (const file of allPages) {
    const html = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    assert.doesNotMatch(html, /<iframe\b/i, `${rel}: iframe в HTML-а — YouTube само след клик`);
    for (const m of html.matchAll(/\s(?:src|srcset|data-src|poster)="([^"]+)"/g)) {
      assert.doesNotMatch(m[1], /^(?:https?:)?\/\/(?!panevascensori\.it\/)/, `${rel}: външен адрес в ${m[0].trim()}`);
    }
    // <link> (preconnect, dns-prefetch, preload, stylesheet) към чужд хост също е заявка преди клик.
    for (const m of html.matchAll(/<link\b[^>]*\shref="([^"]+)"/g)) {
      assert.doesNotMatch(m[1], /^(?:https?:)?\/\/(?!panevascensori\.it\/)/, `${rel}: външен <link> ${m[1]}`);
    }
    assert.doesNotMatch(html, /ytimg\.com|googlevideo\.com|youtube\.com\/iframe_api/, `${rel}: заявка към Google`);
  }
  for (const css of fs.readdirSync(path.join(ROOT, 'css')).filter((f) => f.endsWith('.css'))) {
    assert.doesNotMatch(read(`css/${css}`), /url\(\s*['"]?(?:https?:)?\/\//, `css/${css}: външен url()`);
  }
});

test('всяка фасада: наша снимка, бутон, видимо известие с Google/IP/САЩ, линк към informativa и към YouTube', () => {
  for (const lang of LANGS) {
    for (const key of ['doors', 'guides']) {
      const html = doc(lang, key);
      const figs = figures(html);
      assert.equal(figs.length, 1, `${lang}/${key}: точно една фасада`);
      const fig = figs[0];
      const { id } = VIDEOS[key];
      assert.match(fig, new RegExp(`data-yt="${id}"`), `${lang}/${key}: data-yt`);
      assert.match(fig, new RegExp(`<a class="yt-poster" href="https://www\\.youtube\\.com/watch\\?v=${id}"`), `${lang}/${key}: без JS постерът води в YouTube`);
      assert.match(fig, /<img [^>]*src="\/img\/video\//, `${lang}/${key}: снимката е наша`);
      assert.match(fig, /class="yt-play"/, `${lang}/${key}: бутон`);
      const notice = (fig.match(/<figcaption class="yt-notice">([\s\S]*?)<\/figcaption>/) || [])[1] || '';
      assert.ok(notice, `${lang}/${key}: няма известие`);
      assert.match(notice, /Google/, `${lang}/${key}: известието не казва Google`);
      assert.match(notice, /youtube-nocookie\.com/, `${lang}/${key}: известието не казва youtube-nocookie.com`);
      assert.match(notice, /IP/, `${lang}/${key}: известието не казва IP`);
      assert.match(notice, /USA|САЩ/, `${lang}/${key}: известието не казва САЩ`);
      assert.ok(notice.includes(`href="${urlOf(lang, PRIVACY[lang])}#video"`), `${lang}/${key}: няма линк към раздела за видеата`);
      assert.match(notice, new RegExp(`href="https://www\\.youtube\\.com/watch\\?v=${id}"`), `${lang}/${key}: няма „Apri su YouTube“`);
      // Известието е преди или до бутона, не върху плейъра (Google RMF): в figcaption, след рамката.
      assert.ok(fig.indexOf('yt-notice') > fig.indexOf('yt-play'), `${lang}/${key}: известието е в рамката`);
    }
  }
});

test('VideoObject и HowTo: дата, продължителност, наша снимка, стъпки и времена като във видимото', () => {
  for (const lang of LANGS) {
    for (const key of ['doors', 'guides']) {
      const html = doc(lang, key);
      const v = VIDEOS[key];
      const url = `${ORIGIN}${urlOf(lang, SLUGS[lang][key])}`;
      const graph = graphOf(html);
      const video = graph.find((n) => n['@type'] === 'VideoObject');
      assert.ok(video, `${lang}/${key}: няма VideoObject`);
      assert.equal(video['@id'], `${url}#video`);
      assert.ok(video.name && video.description, `${lang}/${key}: name/description`);
      assert.equal(video.uploadDate, v.uploaded);
      assert.equal(video.duration, v.duration);
      assert.equal(video.embedUrl, `https://www.youtube.com/embed/${v.id}`);
      assert.equal(video.inLanguage, 'it', `${lang}/${key}: клипът е на италиански`);
      for (const thumb of [].concat(video.thumbnailUrl)) {
        assert.ok(thumb.startsWith(`${ORIGIN}/img/video/`), `${lang}/${key}: снимката не е наша: ${thumb}`);
        assert.ok(!thumb.includes('?v='), `${lang}/${key}: Google иска стабилен адрес на снимката`);
        assert.ok(fs.existsSync(path.join(ROOT, thumb.slice(ORIGIN.length))), `${lang}/${key}: няма файл ${thumb}`);
      }
      const webpage = graph.find((n) => n['@id'] === `${url}#webpage`);
      assert.deepEqual(webpage.mainEntity, { '@id': `${url}#video` }, `${lang}/${key}: видеото е основното съдържание`);
      const howto = graph.find((n) => n['@type'] === 'HowTo');
      assert.ok(howto, `${lang}/${key}: няма HowTo`);
      assert.equal(howto.step.length, v.steps.length, `${lang}/${key}: брой стъпки`);
      // Видимият списък: една стъпка = едно време, линк към същия момент в YouTube.
      const items = [...html.matchAll(/<li class="vstep"[\s\S]*?<\/li>/g)].map((m) => m[0]);
      assert.equal(items.length, v.steps.length, `${lang}/${key}: видимите стъпки`);
      items.forEach((li, i) => {
        assert.match(li, new RegExp(`href="https://www\\.youtube\\.com/watch\\?v=${v.id}&amp;t=${v.steps[i]}s"`), `${lang}/${key}: стъпка ${i + 1}`);
        assert.match(li, new RegExp(`data-yt-seek="${v.steps[i]}"`), `${lang}/${key}: стъпка ${i + 1} без data-yt-seek`);
        const name = howto.step[i].name.replaceAll('&', '&amp;');
        assert.ok(li.includes(name), `${lang}/${key}: HowTo стъпка ${i + 1} не е видимата („${howto.step[i].name}“)`);
      });
    }
  }
});

test('хъбът води към двете видеа; видеата — към семейството, каталога и хъба', () => {
  for (const lang of LANGS) {
    const hub = doc(lang, 'hub');
    for (const key of ['doors', 'guides']) {
      assert.ok(hub.includes(`href="${urlOf(lang, SLUGS[lang][key])}"`), `${lang}: хъбът не води към ${key}`);
      const page = doc(lang, key);
      assert.ok(page.includes(`href="${urlOf(lang, SLUGS[lang].hub)}"`), `${lang}/${key}: няма връзка към хъба`);
      assert.match(page, /href="\/docs\/catalogo-staffe-panev-2026\.pdf#page=\d+"/, `${lang}/${key}: няма страница от каталога`);
    }
    assert.equal(figures(hub).length, 0, `${lang}: хъбът е карти с линкове, без плейъри`);
  }
  const it = (slug) => fs.readFileSync(fileOf('it', slug), 'utf8');
  assert.ok(it(SLUGS.it.famDoors).includes(`href="/${SLUGS.it.doors}"`), 'вратите → видеото за вратите');
  assert.ok(it(SLUGS.it.famGuides).includes(`href="/${SLUGS.it.guides}"`), 'опорите SU → видеото за водачите');
  assert.ok(it(SLUGS.it.famSg).includes(`href="/${SLUGS.it.guides}"`), 'SG → видеото за водачите');
  assert.ok(it('index').includes(`href="/${SLUGS.it.hub}"`), 'началната → хъба');
  assert.ok(it('catalogo').includes(`href="/${SLUGS.it.hub}"`), 'каталогът → хъба');
});

// 3D страницата е отделен документ (визьорът на цял екран, templates/viewer.mjs): без менюто и футъра на сайта.
const VIEWER = new Set(['staffe-3d.html', 'brackets-3d.html', 'planki-3d.html']);
test('менюто и футърът водят към хъба на всяка страница', () => {
  for (const file of allPages.filter((f) => !VIEWER.has(path.basename(f)))) {
    const html = fs.readFileSync(file, 'utf8');
    const lang = (html.match(/<html lang="([^"]+)"/) || [])[1];
    const href = `href="${urlOf(lang, SLUGS[lang].hub)}"`;
    const nav = (html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/) || [''])[0];
    const foot = (html.match(/<footer class="site-footer"[\s\S]*?<\/footer>/) || [''])[0];
    assert.ok(nav.includes(href), `${path.relative(ROOT, file)}: менюто`);
    assert.ok(foot.includes(href), `${path.relative(ROOT, file)}: футърът`);
  }
});

test('informativa на трите езика: YouTube след клик, Google Ireland, DPF, раздел #video, без „няма банер“', () => {
  const claims = { it: /Non è quindi presente alcun banner|sito senza cookie/, en: /so no consent banner is shown|cookie-free website/, bg: /затова няма банер|сайт без бисквитки/ };
  for (const lang of LANGS) {
    const html = fs.readFileSync(fileOf(lang, PRIVACY[lang]), 'utf8');
    assert.doesNotMatch(html, claims[lang], `${lang}: старото „без банер / без бисквитки“ още стои`);
    assert.match(html, /<h2 id="video">/, `${lang}: няма раздел #video`);
    for (const must of ['youtube-nocookie.com', 'Google Ireland Limited', 'Data Privacy Framework', '2023/1795', 'policies.google.com/privacy']) {
      assert.ok(html.includes(must), `${lang}: informativa без „${must}“`);
    }
  }
});

test('CSP: в рамка само youtube-nocookie.com, никакъв друг адрес на Google', () => {
  const server = read('server.js');
  const frame = (server.match(/"frame-src[^\n]*/) || [''])[0];
  assert.match(frame, /https:\/\/www\.youtube-nocookie\.com/, 'frame-src без youtube-nocookie.com');
  assert.doesNotMatch(frame, /https:\/\/www\.youtube\.com|youtube\.com(?!-)/, 'frame-src пуска youtube.com — само nocookie');
  const js = read('js/video.js');
  assert.match(js, /https:\/\/www\.youtube-nocookie\.com\/embed\//, 'js/video.js не зарежда от youtube-nocookie.com');
  assert.doesNotMatch(js, /iframe_api|localStorage|sessionStorage|document\.cookie/, 'js/video.js не помни избора и не тегли API-то на YouTube');
});
