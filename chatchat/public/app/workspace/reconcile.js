// Малко DOM-слияние за списъци със съобщения: обновява САМО променените елементи, пази реда и
// фокуса. Така входящо събитие не изтрива текста в отворена редакция и не губи позицията на четене.

const FOCUSABLE = 'button, textarea, input, select, a[href]';

/**
 * @template T
 * @param {HTMLElement} listEl
 * @param {Map<string, {el: HTMLElement, v: string}>} cache
 * @param {T[]} items
 * @param {{ key: (i: T) => string, version: (i: T) => string, make: (i: T) => HTMLElement }} fns
 */
export function reconcile(listEl, cache, items, { key, version, make }) {
  const seen = new Set();
  let prev = null;
  for (const item of items) {
    const k = key(item);
    seen.add(k);
    const v = version(item);
    let entry = cache.get(k);
    if (!entry || entry.v !== v) {
      const el = make(item);
      if (entry) {
        const active = document.activeElement;
        let index = -1;
        if (active && entry.el.contains(active)) {
          index = [...entry.el.querySelectorAll(FOCUSABLE)].indexOf(active);
        }
        entry.el.replaceWith(el);
        if (index >= 0) el.querySelectorAll(FOCUSABLE)[index]?.focus();
      }
      entry = { el, v };
      cache.set(k, entry);
    }
    const ref = prev ? prev.nextSibling : listEl.firstChild;
    if (entry.el !== ref) listEl.insertBefore(entry.el, ref);
    prev = entry.el;
  }
  for (const [k, entry] of cache) {
    if (!seen.has(k)) {
      entry.el.remove();
      cache.delete(k);
    }
  }
}
