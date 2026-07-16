// Дребни DOM/etикетни хелпъри, споделени от extension страниците.

import { t } from './i18n.js';

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// „1 страница“ / „N страници“ — chrome.i18n няма плурализация
export function countLabel(n, oneKey, manyKey) {
  return n === 1 ? t(oneKey) : t(manyKey, [String(n)]);
}
