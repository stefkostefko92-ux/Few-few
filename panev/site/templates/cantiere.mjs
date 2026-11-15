// „Dal cantiere“: снимките на собственика от обектите (img/cantiere/, прави ги
// `cd 3d && node scripts/photos.mjs`: без черните ленти и без метаданни). На началото — колаж от
// производството и обектите, на страниците по семейства — само снимките на семейството.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from './layout.mjs';
import { versioned } from './asset.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PHOTOS = {
  home: ['vano-finito', 'produzione', 'porta-regolazione', 'guida-supporto'],
  famDoors: ['porta-pulita', 'porta-regolazione', 'porta-staffe', 'porta-soglia'],
  famGuides: ['guida-supporto', 'guida-giunzione', 'vano-finito', 'guida-vano'],
  famSg: ['guida-giunzione', 'vano-finito'],
};

function photo(t, name, sizes) {
  const { width, height } = JSON.parse(readFileSync(join(ROOT, 'img', 'cantiere', `${name}.json`), 'utf8'));
  const shape = height > width ? 'is-portrait' : 'is-landscape';
  const src = (w, ext) => versioned(`img/cantiere/${name}-${w}.${ext}`);
  const alt = t.cantiere.photos[name];
  return `<figure class="cantiere-photo cantiere-${name} ${shape}">
    <picture>
      <source type="image/webp" srcset="${src(480, 'webp')} 480w, ${src(960, 'webp')} 960w" sizes="${sizes}">
      <img src="${src(960, 'jpg')}" alt="${esc(alt)}" width="${width}" height="${height}" loading="lazy" decoding="async">
    </picture>
    <figcaption>${esc(alt)}</figcaption>
  </figure>`;
}

// key: home или ключът на страницата по семейство (само тези в PHOTOS имат снимки).
export function cantiereSection(t, key) {
  const names = PHOTOS[key];
  if (!names) return '';
  const c = t.cantiere;
  const home = key === 'home';
  const sizes = home ? '(max-width: 760px) 100vw, (max-width: 1160px) 40vw, 460px' : '(max-width: 760px) 100vw, 300px';
  return `
<section class="section cantiere cantiere-${home ? 'home' : 'fam'}">
  <div class="wrap">
    <h2>${esc(home ? c.title : c.famTitle)}</h2>
    <p class="lead">${esc(home ? c.lead : c.famLead)}</p>
    <div class="cantiere-grid cantiere-n${names.length}">
      ${names.map((n) => photo(t, n, sizes)).join('')}
    </div>
  </div>
</section>`;
}
