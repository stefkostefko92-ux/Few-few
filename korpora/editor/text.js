// The editor's own words — the tabs, the pickers, the tables, the checks chip — in the language of the page. The server
// puts locales/<lang>/editor.json → editor.ui (and the names of the furniture groups, group.*) into
// <script type="application/json" id="editor-text">, and the language into <main lang>. The engine builds the model in
// the same language (words(): the names of the parts, the warnings, the drawings), so the page speaks one language.
// Read on first use: the pure modules run in the tests without a page (setEditorText).
import { translator } from '../engine/i18n.js';

const TAGS = { bg: 'bg-BG', en: 'en-GB', it: 'it-IT' };
let TEXT = null;
let LANG = 'bg';

function load() {
  if (TEXT) return;
  // the tests hand the modules stand-in documents without getElementById (setEditorText gives them the words)
  const page =
    typeof document !== 'undefined' && typeof document.getElementById === 'function'
      ? document
      : null;
  const el = page?.getElementById('editor-text');
  TEXT = el ? JSON.parse(el.textContent) : {};
  const lang = page?.getElementById('main')?.lang;
  LANG = Object.hasOwn(TAGS, lang) ? lang : 'bg';
}

// for the tests: the words and the language without a page
export function setEditorText(text, lang = 'bg') {
  TEXT = text;
  LANG = Object.hasOwn(TAGS, lang) ? lang : 'bg';
}

export function lang() {
  load();
  return LANG;
}

// the language tag for numbers (Intl): a decimal comma in Bulgarian and Italian, a point in English
export const langTag = () => TAGS[lang()];

// the engine's words in the language of the page (engine/i18n.js)
export const words = () => translator(lang());

// a word of the editor; {name} is filled from params. A missing key shows itself (the locale tests keep them all).
export function tx(key, params = {}) {
  load();
  const template = TEXT[key];
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (m, k) =>
    Object.hasOwn(params, k) ? String(params[k]) : m,
  );
}

// a count with its noun: key.one / key.other, {n} in the template
export const txCount = (n, key, params = {}) =>
  tx(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...params });
