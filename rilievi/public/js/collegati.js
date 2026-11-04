// Linked data (src/ordini/collegamenti-elenco.ts, sent here as JSON): the same plant data in the sheet
// and in the supplier forms. A place nobody has typed in follows the others in real time, in every
// direction — empty, or still holding what was put there for it (data-auto): a form takes what the
// sheet says, the sheet what a form says, one form the other. A place someone typed in keeps its value;
// places that say different things are listed under their group, and the server asks to confirm them
// on save. Progressive enhancement: the server fills a form when it first opens and checks on save.
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

  // Numbers the Italian way, the option of a list, what a field of the sheet takes (valori.js).
  if (!window.rilieviValori) return;
  const { same, optionFor, forSheet, pairOf, splitPair } = window.rilieviValori;
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  // The places of each group: a field of the sheet or of a form, read as one value (a number group) or
  // as the categories of its ticks, its Sì/No or its radio group (a choice group). The form's fields by
  // name are collected in one pass — the form has thousands of elements and the groups hundreds of
  // places (the rows of the stops added later are in no group).
  const named = new Map();
  form.querySelectorAll('[name]').forEach((el) => {
    const name = el.getAttribute('name');
    if (named.has(name)) named.get(name).push(el);
    else named.set(name, [el]);
  });
  const byName = (name) => named.get(name) || [];
  const nameOf = (m, key) => (m.luogo === 'scheda' ? key : `${m.luogo}-${key}`);
  const placeOf = (group, m) => {
    const sheet = m.luogo === 'scheda';
    let els;
    let kind;
    if (group.tipo === 'numero' && m.campi) {
      els = m.campi.map((key) => byName(nameOf(m, key))[0]).filter(Boolean);
      kind = els.length === 2 ? 'pair' : null;
    } else if (group.tipo === 'numero') {
      els = byName(nameOf(m, m.campo));
      kind = !els.length ? null : els[0].type === 'radio' ? 'map' : 'text';
    } else if (!sheet && m.campo !== undefined) {
      els = byName(nameOf(m, m.campo));
      kind = 'radio';
    } else {
      const isInput = (el) => el instanceof HTMLInputElement;
      els = Object.keys(m.voci)
        .map((key) =>
          sheet
            ? byName(m.campo).find((el) => isInput(el) && el.getAttribute('value') === key)
            : byName(`${m.luogo}-${key}`).find(isInput),
        )
        .filter(Boolean);
      kind = 'boxes';
    }
    // One field may sit in two groups (the sheet's "Accessi"): its id is the same in both.
    const id = sheet ? m.campo : `${m.luogo}-${m.campo || (m.campi || Object.keys(m.voci)).join()}`;
    return kind && els.length ? { group, m, sheet, els, kind, id } : null;
  };
  const groups = data.gruppi.map((group) => ({
    group,
    places: group.membri.map((m) => placeOf(group, m)).filter(Boolean),
  }));

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

  // Hidden says nothing: a field whose condition is off, a form whose question is not "Sì". Filling is
  // the one exception: the other make's form of the same column (Pelazza ↔ MoviLift), hidden only by
  // the make while the question still says "Sì", lends what it says to its twin — that is how the order
  // carries over when the make changes. It is never a difference: the server reads the open one.
  const shown = (el) => !el.closest('[data-off]');
  const visibleFor = (p, target) => {
    if (shown(p.els[0])) return true;
    if (p.sheet || target.sheet || data.colonne[p.m.luogo] !== data.colonne[target.m.luogo])
      return false;
    const box = p.els[0].closest('[data-modulo]');
    return box !== null && !box.hasAttribute('data-off');
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

  // Every following place takes the first place that says something — someone's own value before one
  // filled in this round, which carries a value from one group to the next (a form → the sheet's
  // "Accessi" → the other form). Followers nobody speaks for are emptied.
  const fill = () => {
    const followers = new Set();
    groups.forEach(({ places }) => places.forEach((p) => follows(p) && followers.add(p.id)));
    const done = new Set();
    const changed = [];
    const speaks = (p) => !followers.has(p.id) || done.has(p.id);
    for (let pass = 0, progress = true; progress && pass < 6; pass += 1) {
      progress = false;
      for (const { places } of groups) {
        for (const target of places) {
          if (!followers.has(target.id) || done.has(target.id)) continue;
          const sources = places.filter((p) => p !== target && speaks(p) && visibleFor(p, target));
          const ordered = [
            ...sources.filter((p) => !followers.has(p.id)),
            ...sources.filter((p) => followers.has(p.id)),
          ];
          const value = ordered.map(read).find((v) => v !== null);
          if (value === undefined) continue;
          changed.push(...write(target, value));
          done.add(target.id);
          progress = true;
        }
      }
    }
    groups.forEach(({ places }) =>
      places.forEach((target) => {
        if (!followers.has(target.id) || done.has(target.id)) return;
        changed.push(...write(target, null));
        done.add(target.id);
      }),
    );
    return changed;
  };

  // What disagrees: different numbers, or ticked boxes with no category in common. Same text as
  // views/schede/_discrepanza.ejs.
  const labelOf = (el) => {
    const label = el.closest('label');
    return label ? label.textContent.trim() : el.value;
  };
  const disagreement = ({ group, places }) => {
    const parts = places
      .filter((p) => shown(p.els[0]))
      .map((p) => ({ p, said: read(p) }))
      .filter(({ said }) => said !== null)
      .map(({ p, said }) =>
        group.tipo === 'numero'
          ? { p, value: said }
          : { p, value: ticked(p).map(labelOf).join(', '), categories: said },
      );
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
    groups.forEach((entry) => {
      const parts = entry.group.confronto ? disagreement(entry) : null;
      if (parts) found.set(entry.group.key, { group: entry.group, parts });
    });
    lists.forEach((box) => {
      const items = box.dataset.diff
        .split(' ')
        .map((key) => found.get(key))
        .filter(Boolean);
      box.querySelector('ul').replaceChildren(
        ...items.map(({ group, parts }) => {
          const item = document.createElement('li');
          const name = document.createElement('strong');
          name.textContent = group.nome;
          const where = parts.map((part) => `${data.luoghi[part.p.m.luogo]}: ${part.value}`);
          item.append(name, ` — ${where.join(' · ')}`);
          return item;
        }),
      );
      box.hidden = items.length === 0;
    });
  };

  // A field of the sheet filled here tells the page, as typing would: app.js shows the fields of its
  // conditions and the rows of the stops, moduli.js the survey fields of the forms. Those events are
  // ours — they do not mark the field as typed in. What they show can speak in turn: a few rounds.
  let ours = false;
  const settle = () => {
    for (let round = 0; round < 3; round += 1) {
      const sheet = fill().filter((el) => !el.closest('[data-modulo]'));
      if (!sheet.length) break;
      ours = true;
      try {
        sheet.forEach((el) =>
          el.dispatchEvent(new Event(isTick(el) ? 'change' : 'input', { bubbles: true })),
        );
      } finally {
        ours = false;
      }
    }
    render();
  };

  // On the document, after app.js and moduli.js: by then a just-opened form or field is shown (its
  // conditions are synced). The field someone changed is theirs from now on — it stops following.
  const update = (event) => {
    const target = event.target;
    if (ours || !(target instanceof HTMLElement) || !form.contains(target)) return;
    if (target.matches('input, select, textarea')) target.dataset.touched = '1';
    settle();
  };
  document.addEventListener('input', update);
  document.addEventListener('change', update);

  // The fields still following — linked here or the forms' survey fields (moduli.js) — travel with the
  // form: if it comes back (an error, the confirmation), the server marks them again.
  form.addEventListener('submit', () => {
    const names = new Set(Array.from(form.querySelectorAll('[data-auto]'), (el) => el.name));
    const following = [...names].filter((name) => {
      const els = Array.from(form.querySelectorAll(`[name="${name}"]`));
      return (
        !els.some(touched) &&
        els.some((el) => (isTick(el) ? el.checked : el.value !== '')) &&
        els.every((el) =>
          isTick(el) ? !el.checked || el.dataset.auto === 'si' : el.value === el.dataset.auto,
        )
      );
    });
    let carrier = form.querySelector('input[name="collegati-auto"]');
    if (!carrier) {
      carrier = document.createElement('input');
      carrier.type = 'hidden';
      carrier.name = 'collegati-auto';
      form.append(carrier);
    }
    carrier.value = following.join(' ');
  });

  // On load: an empty place takes what another already says (a saved sheet, values the browser
  // restored on "back"), and the list matches what is on screen.
  settle();
})();
