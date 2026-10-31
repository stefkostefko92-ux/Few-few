// One supplier form of one column in two places (data-gemelli: the 2SG sheet of the suspensions and of
// the operator — the same form, one saved order): automatic doors ask both questions and only one sheet
// is on screen, the suspensions' when both say "Sì". When the one on screen changes, the one now shown
// takes everything the other held — what was typed, ticked and what still follows the sheet — so
// nothing written is lost; the server reads only the one on screen. Loaded after app.js (the conditions
// are synced first) and before moduli.js and collegati.js (they refill from what is here).
(() => {
  'use strict';

  const groups = new Map();
  document.querySelectorAll('[data-modulo][data-gemelli]').forEach((box) => {
    const key = box.dataset.gemelli;
    groups.set(key, [...(groups.get(key) || []), box]);
  });
  const twins = [...groups.values()].filter((list) => list.length > 1);
  if (!twins.length) return;

  const shown = (box) => !box.closest('[data-off]');
  // "f-so" → "so-": the prefix of the form's field names.
  const prefixOf = (box) => `${box.id.slice(2)}-`;
  const isTick = (el) => el.type === 'checkbox' || el.type === 'radio';
  // What a field carries besides its value: following the sheet, typed in, emptied in a saved form.
  const MARKS = ['auto', 'touched', 'scritto'];

  const copy = (from, to) => {
    const source = prefixOf(from);
    const target = prefixOf(to);
    to.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name.startsWith(target)) return;
      const name = CSS.escape(source + el.name.slice(target.length));
      const twin = Array.from(from.querySelectorAll(`[name="${name}"]`)).find(
        (other) => !isTick(el) || other.value === el.value,
      );
      if (!twin) return;
      if (isTick(el)) el.checked = twin.checked;
      else el.value = twin.value;
      MARKS.forEach((mark) => {
        if (mark in twin.dataset) el.dataset[mark] = twin.dataset[mark];
        else delete el.dataset[mark];
      });
    });
  };

  // The last one on screen: both hidden for a while ("Operatore: No", then "Sospensioni: Sì") still
  // hand over what was written.
  const last = new Map(twins.map((list) => [list, list.find(shown) || null]));
  document.addEventListener('change', () => {
    twins.forEach((list) => {
      const now = list.find(shown) || null;
      const before = last.get(list);
      if (now && before && now !== before) copy(before, now);
      if (now) last.set(list, now);
    });
  });
})();
