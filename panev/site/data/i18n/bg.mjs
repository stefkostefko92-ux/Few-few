// Текстовете на сайта — Български. Разделени са по страници; ключовете са едни и същи
// в трите езика (italiano е източникът на продуктовата терминология).
import common from './bg/common.mjs';
import home from './bg/home.mjs';
import products from './bg/products.mjs';
import pages from './bg/pages.mjs';
import legal from './bg/legal.mjs';

export default { ...common, ...home, ...products, ...pages, ...legal };
