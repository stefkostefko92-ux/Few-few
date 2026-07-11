// Мини i18n за extension страниците: елементите декларират data-i18n /
// data-i18n-placeholder и се пълнят от chrome.i18n (източник: _locales/).

export const t = (key, subs) => chrome.i18n.getMessage(key, subs) || '';

export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
}
