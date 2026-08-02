// Езиков слой — БЪЛГАРСКИЯТ Е ИЗТОЧНИКЪТ НА ИСТИНАТА (правилото на репото).
//
// Никакви ключове по конвенция („nav.ports.title"): ключът Е българският низ,
// точно както го вижда потребителят. Три следствия, заради които е така:
//
//  1. **Липсващ превод деградира до български** — работещ панел с един непреведен
//     ред, а не счупен панел с „nav.ports.title" на екрана.
//  2. **Паритетът е по конструкция** — всеки запис е тройка [bg, en, it] и
//     паритет-тестът проверява масива, не три разминаващи се файла.
//  3. **Нула инструментиране на 5000-те реда** — всичко текстово минава през
//     `el()`/`toast()`, значи преводът живее на ЕДНО място, а не на всяко викане.
//
// Динамичните низове (с числа) се превеждат по ШАБЛОН: числата стават маркери
// ⟦0⟧, ⟦1⟧… и се търси шаблонът. „преди 3 мин" → „преди ⟦0⟧ мин" → "3 min ago".
//
// СЪРВЪРНОТО СЪДЪРЖАНИЕ (аларми, оценки, грешки от API, заглавия на задачи) също
// се превежда — но само ПОКАЗВАНЕТО. Сървърът навсякъде говори български:
// записите на диска (одит), Telegram/ntfy известията и изходът на задачите са
// ЗАПИСИ и напускат панела — език им трябва ЕДИН. Клиентът разпознава сървърния
// низ по шаблон, в който променливите части (име на продукт, unit, път, число)
// са маркери: „Продукт не отговаря: zabobovdol" → „Продукт не отговаря: ⟦0⟧" →
// "Product not responding: ⟦0⟧". Изключение остават суровите одиторски редове
// (key=… title=…) и изходът на shell задачите — те са дословни копия на записа.

const LANGS = ['bg', 'en', 'it'];
const KEY = 'csd.lang';
const TAGS = { bg: 'bg-BG', en: 'en-GB', it: 'it-IT' };

let lang = 'bg';
try {
  const saved = localStorage.getItem(KEY);
  if (LANGS.includes(saved)) lang = saved;
} catch {
  /* без localStorage (стар браузър/private) → български */
}

export function getLang() {
  return lang;
}

export function langTag() {
  return TAGS[lang] || 'bg-BG';
}

export function setLang(next) {
  if (!LANGS.includes(next)) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* пак ще е валидно до края на страницата */
  }
  // Презареждане, не частичен re-render: езикът е в стотици вече нарисувани
  // възела, а състоянието на панела е на сървъра. Пълното презареждане е
  // единственият път без нито един пропуснат низ.
  location.reload();
}

export function languages() {
  return [
    { id: 'bg', label: 'БГ' },
    { id: 'en', label: 'EN' },
    { id: 'it', label: 'IT' },
  ];
}

// ── Речникът ─────────────────────────────────────────────────────────────────
// Тройки [bg, en, it]. Динамичните шаблони носят ⟦0⟧, ⟦1⟧… на мястото на числата;
// %s е за tf(). Типография по език: EN "…", IT «…» и учтива форма (Lei).
import { ENTRIES } from './i18n-dict.js';

const maps = { en: new Map(), it: new Map() };
for (const [bg, en, it] of ENTRIES) {
  maps.en.set(bg, en);
  maps.it.set(bg, it);
}

// Числата (вкл. 1.5 / 1,5 / 3:04 / 97%) стават маркери, за да съвпадне шаблонът.
// Мерната единица се ПОГЛЪЩА заедно с числото („82 MB", „9.4 KB/s", „140 ms") —
// иначе всяка комбинация от единици иска отделен шаблон в речника.
const NUM_RX = /\d+(?:[.,:]\d+)*(?:\s?(?:(?:[KMGTP]i?)?B\/s|(?:[KMGTP]i?)?B|ms)(?![\wа-я])|%)?/g;

function extract(s) {
  const values = [];
  const pattern = s.replace(NUM_RX, (m) => {
    values.push(m);
    return `⟦${values.length - 1}⟧`;
  });
  return { pattern, values };
}

function restore(tpl, values) {
  return tpl.replace(/⟦(\d+)⟧/g, (_, i) => values[Number(i)] ?? '');
}

// Трето стъпало — за СЪРВЪРНИТЕ низове: маркер става всяка латинска дума/път/
// число (данните в български текст са почти винаги на латиница — продукт, unit,
// домейн, път). БЕЗ поглъщане на единици тук: ключовете се извличат от
// изходния код (`${…}` → ⟦n⟧) и двете страни трябва да токенизират еднакво.
// Токенът НЕ завършва на „.“/„:“/„,“ — те са препинателни знаци от изречението
// („zabobovdol: харчи…“ иначе гълта двоеточието и шаблонът не съвпада — същият
// капан като със запетаята при числата). Вътрешни са позволени (example.com,
// 127.0.0.1:7700, tools/x.mjs).
const DATA_RX = /(?:[A-Za-z\/_](?:[A-Za-z0-9\/_.:@*+-]*[A-Za-z0-9\/_@*+-])?|\d+(?:[.,:]\d+)*)/g;

function extractData(s) {
  const values = [];
  const pattern = s.replace(DATA_RX, (m) => {
    values.push(m);
    return `⟦${values.length - 1}⟧`;
  });
  return { pattern, values };
}

// Липсващите преводи се събират (Set, таван 2000) — така рънтайм обиколка на
// панела ИЗБРОЯВА какво не е покрито, вместо някой да го забележи след месец.
const COMPOSITE_PREFIXES = ['Възстановено: ', 'Провалена задача: ', '→ '];

const missing = new Set();
if (typeof window !== 'undefined') window.__i18nMissing = missing;

export function t(s) {
  if (lang === 'bg') return s;
  if (typeof s !== 'string' || !s || !/[а-яА-Я]/.test(s)) return s;
  const map = maps[lang];
  const hit = map.get(s);
  if (hit) return hit;
  if (/\d/.test(s)) {
    const { pattern, values } = extract(s);
    const p = map.get(pattern);
    if (p) return restore(p, values);
  }
  // Сървърните низове: данните (латиница/числа) стават маркери. Пробва се само
  // ако изобщо има данни за маркиране — чист български текст няма какво да
  // спечели от това стъпало. Наклонената черта също е данни („Дрейф/консистентност"
  // → „Дрейф⟦0⟧консистентност") — порталът я токенизира, значи и портата я пуска.
  if (/[A-Za-z\d\/_]/.test(s)) {
    const { pattern, values } = extractData(s);
    const p = map.get(pattern);
    if (p) return restore(p, values);
  }
  // Съставни заглавия („Възстановено: <заглавие на аларма>") — префиксът се
  // превежда, остатъкът минава през СЪЩИЯ механизъм рекурсивно.
  for (const pre of COMPOSITE_PREFIXES) {
    if (s.startsWith(pre)) {
      const head = map.get(pre.trimEnd()) ?? (/[а-яА-Я]/.test(pre) ? null : pre.trimEnd());
      const rest = t(s.slice(pre.length));
      if (head && rest !== s.slice(pre.length)) return `${head} ${rest}`;
      if (head && map.get(pre.trimEnd())) return `${head} ${rest}`;
    }
  }
  if (missing.size < 2000) missing.add(s);
  return s;
}

// printf-стил за малкото места, където маркерът НЕ е число (име на том, път):
// tf('Изпиши „%s“, за да потвърдиш:', 'aso_pgdata').
export function tf(fmt, ...args) {
  let out = t(fmt);
  for (const a of args) out = out.replace('%s', String(a));
  return out;
}

// Превод на статичния HTML (входният екран, страничната лента): обхожда
// текстовите възли и title/placeholder/aria-label атрибутите ВЕДНЪЖ при
// стартиране — без нито една промяна по маркировката.
export function translateDom(root) {
  if (lang === 'bg' || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const translated = t(trimmed);
    if (translated !== trimmed) node.nodeValue = raw.replace(trimmed, translated);
  }
  for (const attr of ['title', 'placeholder', 'aria-label']) {
    for (const elx of root.querySelectorAll(`[${attr}]`)) {
      const v = elx.getAttribute(attr);
      const tv = t(v);
      if (tv !== v) elx.setAttribute(attr, tv);
    }
  }
}
