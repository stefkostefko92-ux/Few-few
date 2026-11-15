// Текстовете на сайта — Български. Разделени са по страници; ключовете са едни и същи
// в трите езика (italiano е източникът на продуктовата терминология).
import common from './bg/common.mjs';
import home from './bg/home.mjs';
import products from './bg/products.mjs';
import pages from './bg/pages.mjs';
import legal from './bg/legal.mjs';
import families from './bg/families.mjs';

// Страниците по семейства добавят свои адреси и мета към общите (families.mjs).
export default {
  ...common, ...home, ...products, ...pages, ...legal,
  families: families.families,
  slugs: { ...common.slugs, ...families.familySlugs },
  meta: { ...common.meta, ...families.familyMeta },
};
