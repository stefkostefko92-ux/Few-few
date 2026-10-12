// Мини i18n за extension страниците: елементите декларират data-i18n /
// data-i18n-placeholder и се пълнят от chrome.i18n (източник: _locales/).

export const t = (key, subs) => chrome.i18n.getMessage(key, subs) || '';

// Езикът и посоката на страницата следват интерфейса на браузъра (73 езика,
// 4 от тях RTL — ar/he/fa/ur): екранните четци четат с правилното произношение,
// а логическите CSS свойства (inline-start/end) огледалват подредбата сами.
export function applyDirection(doc = document) {
  const html = doc.documentElement;
  html.lang = chrome.i18n.getUILanguage?.() || html.lang;
  html.dir = chrome.i18n.getMessage('@@bidi_dir') || 'ltr';
}

export function applyI18n(root = document) {
  if (root === document) applyDirection();
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
}
