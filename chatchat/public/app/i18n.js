// Езици на интерфейса: it (основен) и en — само тези два (решение на собственика). Речникът е плосък.
// В localStorage се пази САМО изборът на език (с try/catch).

export const LANGS = ['it', 'en'];
const STORE_KEY = 'chatchat.lang';

let dict = {};
let fallback = {};
let lang = 'it';

async function load(l) {
  const res = await fetch(`/i18n/${l}.json`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`i18n ${l}`);
  return res.json();
}

export function storedLang() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return LANGS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function guessLang(userLocale) {
  const cands = [storedLang(), userLocale, ...(navigator.languages ?? [])];
  for (const c of cands) {
    const short = typeof c === 'string' ? c.toLowerCase().slice(0, 2) : '';
    if (LANGS.includes(short)) return short;
  }
  return 'it';
}

export async function setLang(l, { persist = true } = {}) {
  const next = LANGS.includes(l) ? l : 'it';
  if (!Object.keys(fallback).length) fallback = await load('it');
  dict = next === 'it' ? fallback : await load(next);
  lang = next;
  document.documentElement.lang = next;
  if (persist) {
    try {
      localStorage.setItem(STORE_KEY, next);
    } catch {
      /* ignorato: la scelta della lingua non è critica */
    }
  }
  applyStatic();
}

export const getLang = () => lang;

function format(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

export function has(key) {
  return key in dict || key in fallback;
}

export function t(key, params) {
  const str = dict[key] ?? fallback[key];
  return str === undefined ? key : format(str, params);
}

/**
 * Код от Safety Gate (gate.*, ctx.*, collect.*, вкл. „ctx.unknownIdentifier:E99“).
 * Непознат код се показва суров — никога не се крие.
 */
export function tCode(code) {
  if (typeof code !== 'string' || code === '') return '';
  const idx = code.indexOf(':');
  const base = idx === -1 ? code : code.slice(0, idx);
  const param = idx === -1 ? undefined : code.slice(idx + 1);
  const key = `code.${base}`;
  if (!has(key)) return code;
  return format(t(key), { param: param ?? '' });
}

/** Стойност „като е“, ако е код; иначе свободният текст на модела. */
export function tMaybeCode(text) {
  if (typeof text === 'string' && /^(gate|ctx|collect|ai)\.[\w.]+(:.*)?$/.test(text))
    return tCode(text);
  return text;
}

export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    }
  }
  const disc = root.querySelector('[data-i18n="disclaimer.text"]');
  if (disc) disc.textContent = t('disclaimer.text');
  for (const sel of root.querySelectorAll('[data-lang-select]')) sel.value = lang;
  document.title = `ChatChat — ${t('app.subtitle')} | Carbon Stealth`;
}
