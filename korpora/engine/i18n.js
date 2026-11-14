// The engine's words in the language of the person: the names of the parts, the warnings of the checks, the cut list,
// the drilling table, the drawings and the form of the types. Bulgarian is the source (i18n/bg.js); English and Italian
// mirror it key for key (tests/engine/i18n.test.mjs). A model is built in one language — buildModel(input, { lang }) —
// and everything made from it (BOM, CSV, drawings, the comments of the CNC files) speaks it: model.lang.
import { dimTxt } from './util.js';
import bg from './i18n/bg.js';
import en from './i18n/en.js';
import it from './i18n/it.js';

export const CATALOGS = { bg, en, it };
export const ENGINE_LANGS = Object.keys(CATALOGS);
// for sorting and Intl: the language tags of the product (src/i18n.ts)
const TAGS = { bg: 'bg-BG', en: 'en-GB', it: 'it-IT' };

const fill = (template, params) => template.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(params, k) ? String(params[k]) : m));

function make(code) {
  const own = CATALOGS[code];
  // a key Bulgarian lacks is a fault of the program (the tests have all keys); another language falls back to Bulgarian
  const t = (key, params = {}) => {
    const template = own[key] ?? bg[key];
    if (template === undefined) throw new Error(`engine i18n: no text for „${key}“`);
    return fill(template, params);
  };
  t.lang = code;
  t.tag = TAGS[code];
  // numbers in the text: a decimal comma in Bulgarian and Italian, a point in English
  t.num = code === 'en' ? (v) => dimTxt(v).replace(',', '.') : dimTxt;
  // a count with its noun: key.one / key.other, {n} in the template
  t.count = (n, key, params = {}) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...params });
  // a value of the hardware data in the language — name_en, productName_it… (engine/data, catalog.js) — or the item's own
  // (a shop's product keeps its name: it is what the shop sells it by)
  t.of = (item, field = 'name') => item?.[`${field}_${code}`] ?? item?.[field] ?? '';
  return t;
}

const translators = new Map();
export function translator(lang) {
  const code = Object.hasOwn(CATALOGS, lang) ? lang : 'bg';
  if (!translators.has(code)) translators.set(code, make(code));
  return translators.get(code);
}
