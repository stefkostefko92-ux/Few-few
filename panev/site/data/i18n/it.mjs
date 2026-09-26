// Текстовете на сайта — Italiano. Разделени са по страници; ключовете са едни и същи
// в трите езика (italiano е източникът на продуктовата терминология).
import common from './it/common.mjs';
import home from './it/home.mjs';
import products from './it/products.mjs';
import pages from './it/pages.mjs';
import legal from './it/legal.mjs';

export default { ...common, ...home, ...products, ...pages, ...legal };
