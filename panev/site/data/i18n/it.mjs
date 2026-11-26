// Текстовете на сайта — Italiano. Разделени са по страници; ключовете са едни и същи
// в трите езика (italiano е източникът на продуктовата терминология).
import common from './it/common.mjs';
import home from './it/home.mjs';
import products from './it/products.mjs';
import pages from './it/pages.mjs';
import legal from './it/legal.mjs';
import families from './it/families.mjs';
import guides from './it/guides.mjs';
import videos from './it/videos.mjs';

// Страниците по семейства добавят свои адреси и мета към общите (families.mjs).
export default {
  ...common, ...home, ...products, ...pages, ...legal,
  families: families.families,
  guides: guides.guides,
  videos: videos.videos,
  slugs: { ...common.slugs, ...families.familySlugs, ...guides.guideSlugs, ...videos.videoSlugs },
  meta: { ...common.meta, ...families.familyMeta, ...guides.guideMeta, ...videos.videoMeta },
};
