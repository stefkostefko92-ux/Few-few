// One place of the linked data (collegati.js): how it is read, whether it still follows the others, how a
// value is written into it. A place is a field of the sheet or of a supplier form — text, a pair of
// lines ("LUCE PORTA: [800] x [2000]"), ticks, a Sì/No or a radio group; its elements are `p.els`.
(() => {
  'use strict';

  if (!window.rilieviValori) return;
  const { same, optionFor, forSheet, pairOf, splitPair } = window.rilieviValori;
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  const keyOf = (p, el) =>
    p.sheet || p.kind === 'radio' ? el.value : el.name.slice(p.m.luogo.length + 1);
  const ticked = (p) => p.els.filter((el) => el.checked && hasOwn(p.m.voci, keyOf(p, el)));
  // What a place says: text for a number group, categories for a choice; null — nothing.
  const read = (p) => {
    if (p.kind === 'pair') return pairOf(...p.els.map((el) => el.value.trim())) || null;
    if (p.kind === 'map') {
      // Only the map's own keys: "constructor" from a tampered form is not an answer.
      const box = p.els.find((el) => el.checked);
      return box && hasOwn(p.m.valori, box.value) ? p.m.valori[box.value] : null;
    }
    if (p.kind === 'text') return p.els[0].value.trim() || null;
    const boxes = ticked(p);
    return boxes.length ? new Set(boxes.map((el) => p.m.voci[keyOf(p, el)])) : null;
  };

  // A place follows while nobody has typed in it: empty, or still what was put there for it.
  const touched = (el) => el.dataset.touched === '1';
  const isTick = (el) => el.type === 'checkbox' || el.type === 'radio';
  const follows = (p) =>
    !p.els.some(touched) &&
    p.els.every((el) =>
      isTick(el)
        ? !el.checked || el.dataset.auto === 'si'
        : el.value === '' || el.value === el.dataset.auto,
    );

  // Writing into a following place; the elements that changed come back (the sheet's get events).
  const setText = (el, value) => {
    const before = el.value;
    el.value = value;
    el.dataset.auto = el.value;
    return el.value !== before;
  };
  const setTick = (el, on) => {
    const changed = el.checked !== on;
    el.checked = on;
    el.dataset.auto = on ? 'si' : '';
    return changed;
  };
  const write = (p, value) => {
    if (p.kind === 'pair') {
      const parts = splitPair(value || '');
      return p.els.filter((el, i) => setText(el, parts[i]));
    }
    if (p.kind === 'map') {
      const key = value ? Object.keys(p.m.valori).find((k) => same(p.m.valori[k], value)) : null;
      return p.els.filter((el) => setTick(el, el.value === key));
    }
    if (p.kind === 'text') {
      const el = p.els[0];
      const text = value || '';
      const next =
        el instanceof HTMLSelectElement
          ? optionFor(el, text)
          : p.sheet
            ? forSheet(p.m, text)
            : text.slice(0, el.maxLength > 0 ? el.maxLength : undefined);
      return setText(el, next) ? [el] : [];
    }
    const wanted = new Set();
    for (const category of value || []) {
      const keys = Object.keys(p.m.voci).filter((key) => p.m.voci[key] === category);
      // A radio has one answer: only for one category over there, and its first button here. A
      // category ticks a box only when exactly one box means it.
      if (p.kind === 'radio' && value.size === 1 && keys.length) wanted.add(keys[0]);
      if (p.kind !== 'radio' && keys.length === 1) wanted.add(keys[0]);
    }
    // Nothing said elsewhere: a radio goes back to the blank form's own answer, if it has one.
    const fallback =
      p.kind === 'radio' && !wanted.size ? p.els.find((el) => 'predefinito' in el.dataset) : null;
    return p.els.filter((el) => setTick(el, el === fallback || wanted.has(keyOf(p, el))));
  };

  window.rilieviLuoghi = Object.freeze({
    keyOf,
    ticked,
    read,
    touched,
    isTick,
    follows,
    setText,
    write,
  });
})();
