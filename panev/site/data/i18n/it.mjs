// Текстовете на сайта — Italiano. Разделени са по страници; ключовете са едни и същи
// в трите езика (italiano е източникът на продуктовата терминология).
import common from './it/common.mjs';
import home from './it/home.mjs';
import products from './it/products.mjs';
import pages from './it/pages.mjs';
import legal from './it/legal.mjs';
import families from './it/families.mjs';
import guides from './it/guides.mjs';

// Страниците по семейства добавят свои адреси и мета към общите (families.mjs).
export default {
  ...common, ...home, ...products, ...pages, ...legal,
  families: families.families,
  guides: guides.guides,
  slugs: { ...common.slugs, ...families.familySlugs, ...guides.guideSlugs },
  meta: { ...common.meta, ...families.familyMeta, ...guides.guideMeta },
};
