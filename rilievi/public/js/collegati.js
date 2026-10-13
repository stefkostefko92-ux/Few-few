// Linked data between the sheet and the two supplier forms (src/ordini/collegati.ts, sent here as JSON):
// an empty field of a form takes what the sheet or the other form already says, and keeps following it
// until someone types in it; values that disagree are listed under their group. Progressive
// enhancement: the server fills the forms when they first open and asks to confirm on save — this
// only does the same while typing.
(() => {
  'use strict';

  const source = document.getElementById('collegati-dati');
  const form = document.querySelector('[data-scheda-form]');
  if (!source || !form) return;
  let data;
  try {
    data = JSON.parse(source.textContent || '');
  } catch {
    return;
  }

  // Numbers the Italian way: "1.000" is a thousand, "1,6" and "1.6" are the same, units do not count.
  // Same as numeriDi() and stessoValore() in src/ordini/collegati.ts.
  const NUMBER = /[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g;
  const THOUSANDS = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/;
  const numbersOf = (text) =>
    Array.from(text.matchAll(NUMBER), ([token]) =>
      Number(
        THOUSANDS.test(token)
          ? token.replace(/\./g, '').replace(',', '.')
          : token.replace(',', '.'),
      ),
    );
  const plain = (text) =>
    text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const same = (a, b) => {
    const na = numbersOf(a);
    const nb = numbersOf(b);
    if (na.length || nb.length) {
      return na.length === nb.length && na.every((n, i) => Math.abs(n - nb[i]) < 1e-9);
    }
    return plain(a) === plain(b);
  };

  // Hidden means not said: a field whose condition is off, a form whose question is not "Sì".
  const shown = (el) => !el.closest('[data-off]');
  const touched = (el) => el.dataset.touched === '1';

  const numberInputs = (m) =>
    Array.from(
      form.querySelectorAll(`[name="${m.luogo === 'scheda' ? m.campo : `${m.luogo}-${m.campo}`}"]`),
    );
  const readNumber = (m) => {
    const inputs = numberInputs(m);
    if (!inputs.length || !shown(inputs[0])) return null;
    const raw =
      inputs[0].type === 'radio'
        ? (inputs.find((input) => input.checked) || { value: '' }).value
        : inputs[0].value.trim();
    // Only the map's own keys: "constructor" from a tampered form is not an answer.
    const own = m.valori && Object.prototype.hasOwnProperty.call(m.valori, raw);
    return (m.valori ? (own ? m.valori[raw] : '') : raw) || null;
  };
  const boxesOf = (m) =>
    Object.keys(m.voci)
      .map((key) =>
        form.querySelector(
          m.luogo === 'scheda'
            ? `input[name="${m.campo}"][value="${key}"]`
            : `input[name="${m.luogo}-${key}"]`,
        ),
      )
      .filter(Boolean);
  const keyOf = (m, box) => (m.luogo === 'scheda' ? box.value : box.name.slice(m.luogo.length + 1));
  const readChoice = (m) => {
    const boxes = boxesOf(m);
    if (!boxes.length || !shown(boxes[0])) return null;
    const ticked = boxes.filter((box) => box.checked);
    return ticked.length ? ticked : null;
  };
  const labelOf = (box) => {
    const label = box.closest('label');
    return label ? label.textContent.trim() : box.value;
  };

  // A form field follows the others while nobody has typed in it: empty, or still holding what was
  // put there for it (data-auto — by the server when the form first opened, or here).
  const follows = (input) =>
    !touched(input) && (input.value === '' || input.value === input.dataset.auto);
  const followsChoice = (boxes) =>
    boxes.every((box) => !touched(box) && (!box.checked || box.dataset.auto === 'si'));

  const fill = () => {
    for (const group of data.gruppi) {
      for (const target of group.membri) {
        if (target.luogo === 'scheda') continue;
        const others = group.membri.filter((m) => m !== target);
        if (group.tipo === 'numero') {
          const input = form.querySelector(`[name="${target.luogo}-${target.campo}"]`);
          if (!input || !follows(input)) continue;
          const value = others.map(readNumber).find(Boolean) || '';
          const next = input.maxLength > 0 ? value.slice(0, input.maxLength) : value;
          input.value = next;
          input.dataset.auto = next;
          continue;
        }
        const boxes = boxesOf(target);
        if (!boxes.length || !followsChoice(boxes)) continue;
        const wanted = new Set();
        for (const m of others) {
          const ticked = readChoice(m);
          if (!ticked) continue;
          // A category ticks a box here only when exactly one box means it.
          for (const category of new Set(ticked.map((box) => m.voci[keyOf(m, box)]))) {
            const keys = Object.keys(target.voci).filter((key) => target.voci[key] === category);
            if (keys.length === 1) wanted.add(keys[0]);
          }
          break;
        }
        boxes.forEach((box) => {
          box.checked = wanted.has(keyOf(target, box));
          box.dataset.auto = box.checked ? 'si' : '';
        });
      }
    }
  };

  // What disagrees: different numbers, or ticked boxes with no category in common.
  const disagreement = (group) => {
    const parts = [];
    for (const m of group.membri) {
      if (group.tipo === 'numero') {
        const value = readNumber(m);
        if (value) parts.push({ m, value });
      } else {
        const ticked = readChoice(m);
        if (ticked) {
          parts.push({
            m,
            value: ticked.map(labelOf).join(', '),
            categories: new Set(ticked.map((box) => m.voci[keyOf(m, box)])),
          });
        }
      }
    }
    if (parts.length < 2) return null;
    const differs =
      group.tipo === 'numero'
        ? parts.some((part) => !same(part.value, parts[0].value))
        : parts.some((a, i) =>
            parts.slice(i + 1).some((b) => ![...a.categories].some((c) => b.categories.has(c))),
          );
    return differs ? parts : null;
  };

  const lists = Array.from(form.querySelectorAll('[data-diff]'));
  const render = () => {
    const found = new Map();
    for (const group of data.gruppi) {
      const parts = disagreement(group);
      if (parts) found.set(group.key, { group, parts });
    }
    lists.forEach((box) => {
      const items = box.dataset.diff
        .split(' ')
        .map((key) => found.get(key))
        .filter(Boolean);
      const list = box.querySelector('ul');
      // Same text as views/schede/_discrepanza.ejs.
      list.replaceChildren(
        ...items.map(({ group, parts }) => {
          const item = document.createElement('li');
          const name = document.createElement('strong');
          name.textContent = group.nome;
          const where = parts.map((part) => `${data.luoghi[part.m.luogo]}: ${part.value}`);
          item.append(name, ` — ${where.join(' · ')}`);
          return item;
        }),
      );
      box.hidden = items.length === 0;
    });
  };

  // On the document, after app.js: by then a just-opened form or field is shown (its conditions are
  // synced) and the field someone changed is marked as touched — it stops following the others.
  const update = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !form.contains(target)) return;
    if (target.closest('[data-modulo]')) target.dataset.touched = '1';
    fill();
    render();
  };
  document.addEventListener('input', update);
  document.addEventListener('change', update);

  // The fields still following the others travel with the form: if it comes back (an error, the
  // confirmation), the server marks them again (data-auto) and they keep following.
  form.addEventListener('submit', () => {
    const names = [];
    for (const group of data.gruppi) {
      for (const m of group.membri) {
        if (m.luogo === 'scheda') continue;
        if (group.tipo === 'numero') {
          const input = form.querySelector(`[name="${m.luogo}-${m.campo}"]`);
          if (input && input.value !== '' && follows(input)) names.push(input.name);
        } else {
          const boxes = boxesOf(m);
          if (boxes.length && followsChoice(boxes)) {
            boxes.filter((box) => box.checked).forEach((box) => names.push(box.name));
          }
        }
      }
    }
    let carrier = form.querySelector('input[name="collegati-auto"]');
    if (!carrier) {
      carrier = document.createElement('input');
      carrier.type = 'hidden';
      carrier.name = 'collegati-auto';
      form.append(carrier);
    }
    carrier.value = names.join(' ');
  });
  // Values the browser restored on "back" may disagree with what the server listed.
  render();
})();
