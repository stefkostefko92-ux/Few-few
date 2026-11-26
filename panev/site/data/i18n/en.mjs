// Текстовете на сайта — English. Разделени са по страници; ключовете са едни и същи
// в трите езика (italiano е източникът на продуктовата терминология).
import common from './en/common.mjs';
import home from './en/home.mjs';
import products from './en/products.mjs';
import pages from './en/pages.mjs';
import legal from './en/legal.mjs';
import families from './en/families.mjs';
import guides from './en/guides.mjs';
import videos from './en/videos.mjs';

// Страниците по семейства добавят свои адреси и мета към общите (families.mjs).
export default {
  ...common, ...home, ...products, ...pages, ...legal,
  families: families.families,
  guides: guides.guides,
  videos: videos.videos,
  slugs: { ...common.slugs, ...families.familySlugs, ...guides.guideSlugs, ...videos.videoSlugs },
  meta: { ...common.meta, ...families.familyMeta, ...guides.guideMeta, ...videos.videoMeta },
};
