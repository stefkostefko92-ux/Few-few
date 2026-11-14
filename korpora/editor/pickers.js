// Picker dialog for decors, RAL colours and handles: search, filter chips, swatch grid or product list.
import { decorList, ralList, decor, isBaseDecor } from '../engine/materials.js';
import { handleList, handleHoles } from '../engine/hardware.js';
import { $, esc, money, swatchStyle, fmt, setHtml } from './dom.js';
import { handleIcon } from './icons.js';

export const CATEGORY_BG = {
  uni: 'Едноцветни',
  wood: 'Дърво',
  stone: 'Камък',
  concrete: 'Бетон',
  metal: 'Метал',
  fantasy: 'Фантазия',
  textile: 'Текстил',
  paint: 'Боя',
  other: 'Други',
};
export const HANDLE_TYPE_BG = {
  bar: 'Лайсна',
  knob: 'Копче',
  profile: 'Профил',
  edge: 'Ръбова',
  shell: 'Черупка',
  recessed: 'Вградена',
  gola: 'Gola профил',
  ring: 'Халка',
  other: 'Друга',
};
const RAL_GROUP = {
  1: 'Жълти',
  2: 'Оранжеви',
  3: 'Червени',
  4: 'Виолетови',
  5: 'Сини',
  6: 'Зелени',
  7: 'Сиви',
  8: 'Кафяви',
  9: 'Бели и черни',
};
const PAGE = 240;

const dlg = () => $('#picker');
let current = null;

function chipsHtml(name, options, value) {
  return options
    .map(
      ([v, l, n]) =>
        `<button type="button" class="chip" data-chip="${name}" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(l)}${n !== undefined ? ` <small>${n}</small>` : ''}</button>`,
    )
    .join('');
}

const count = (items, f) => items.reduce((m, x) => m.set(f(x), (m.get(f(x)) ?? 0) + 1), new Map());

const MODES = {
  decor: {
    title: 'Декор',
    items: () => {
      const all = decorList();
      const real = all.filter((d) => !isBaseDecor(d));
      return real.length ? real : all;
    },
    chips(items, st) {
      const byM = count(items, (d) => d.manufacturer);
      const byC = count(items, (d) => d.category);
      return [
        chipsHtml(
          'm',
          [
            ['', 'Всички', items.length],
            ...[...byM].sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, m, n]),
          ],
          st.m ?? '',
        ),
        chipsHtml(
          'c',
          [['', 'Всички видове'], ...[...byC].map(([c, n]) => [c, CATEGORY_BG[c] ?? c, n])],
          st.c ?? '',
        ),
      ];
    },
    match: (d, st, q) =>
      (!st.m || d.manufacturer === st.m) &&
      (!st.c || d.category === st.c) &&
      (!q || `${d.code} ${d.name} ${d.nameEn ?? ''} ${d.manufacturer}`.toLowerCase().includes(q)),
    render: (d, sel) =>
      `<button type="button" class="sw-card" role="option" tabindex="-1" aria-selected="${d.id === sel}" data-id="${esc(d.id)}"><i class="sw" data-css="${esc(swatchStyle(d))}"></i><span><b>${esc(d.code)}</b> ${esc(d.name)}<small>${esc(d.manufacturer)}${d.availableBg === false ? ' · по поръчка' : ''}</small></span></button>`,
    grid: true,
  },
  ral: {
    title: 'RAL цвят (МДФ, боядисан)',
    items: () => ralList().map((r) => ({ ...decor(r.code), id: r.code, group: r.code.charAt(4) })),
    chips(items, st) {
      const byG = count(items, (r) => r.group);
      return [
        chipsHtml(
          'g',
          [
            ['', 'Всички', items.length],
            ...[...byG].sort().map(([g, n]) => [g, `${g}… ${RAL_GROUP[g] ?? ''}`, n]),
          ],
          st.g ?? '',
        ),
      ];
    },
    match: (r, st, q) =>
      (!st.g || r.group === st.g) && (!q || `${r.id} ${r.name}`.toLowerCase().includes(q)),
    render: (r, sel) =>
      `<button type="button" class="sw-card" role="option" tabindex="-1" aria-selected="${r.id === sel}" data-id="${esc(r.id)}"><i class="sw" data-css="${esc(`background:${r.hex}`)}"></i><span><b>${esc(r.id)}</b> ${esc(r.name)}</span></button>`,
    grid: true,
  },
  handle: {
    title: 'Дръжка',
    items: () => [{ id: 'none', name: 'Без дръжка', type: 'other', none: true }, ...handleList()],
    chips(items, st) {
      const real = items.filter((h) => !h.none);
      const byT = count(real, (h) => h.type);
      const bySp = count(
        real.filter((h) => handleHoles(h).pair),
        (h) => h.spacing,
      );
      const sp = [...bySp].filter(([, n]) => n >= 5).sort((a, b) => a[0] - b[0]);
      return [
        chipsHtml(
          't',
          [
            ['', 'Всички', real.length],
            ...[...byT].map(([t, n]) => [t, HANDLE_TYPE_BG[t] ?? t, n]),
          ],
          st.t ?? '',
        ),
        chipsHtml(
          's',
          [
            ['', 'Всяко междуосие'],
            ['1', '1 отвор'],
            ...sp.map(([s, n]) => [String(s), `${s} mm`, n]),
          ],
          st.s ?? '',
        ),
      ];
    },
    match: (h, st, q) =>
      h.none
        ? !st.t && !st.s && !q
        : (!st.t || h.type === st.t) &&
          (!st.s || (handleHoles(h).pair ? String(h.spacing) === st.s : st.s === '1')) &&
          (!q ||
            `${h.name} ${h.brand ?? ''} ${h.sku ?? ''} ${h.finish ?? ''}`
              .toLowerCase()
              .includes(q)),
    render: (h, sel) =>
      `<button type="button" class="pk-row" role="option" tabindex="-1" aria-selected="${h.id === sel}" data-id="${esc(h.id)}">${handleIcon(h)}<span class="pk-main"><b>${esc(h.name)}</b><small>${esc(h.none ? 'TIP-ON или профил — не е включен' : [h.brand, h.sku, HANDLE_TYPE_BG[h.type], h.finish].filter(Boolean).join(' · '))}</small></span><span class="pk-side">${h.none ? '' : `${esc(handleHoles(h).label)}<small>${esc(money(h.price, h.currency))}${h.shop ? ` · ${esc(h.shop)}` : ''}</small>`}</span></button>`,
    grid: false,
  },
};

// Open the picker. onPick(id) is called with the chosen id.
export function openPicker(mode, selected, onPick) {
  const m = MODES[mode];
  current = { m, st: {}, q: '', selected, onPick, shown: PAGE, items: m.items() };
  $('#picker-title').textContent = m.title;
  $('#pk-q').value = '';
  $('#pk-list').className = m.grid ? 'pk-list grid' : 'pk-list';
  draw();
  dlg().showModal();
  $('#pk-q').focus();
}

function draw() {
  const { m, st, q, items, selected, shown } = current;
  const [c1 = '', c2 = ''] = m.chips(items, st);
  $('#pk-chips').innerHTML = c1;
  $('#pk-chips2').innerHTML = c2;
  const hits = items.filter((x) => m.match(x, st, q));
  $('#pk-count').textContent = `${fmt(hits.length)} от ${fmt(items.length)}`;
  setHtml(
    $('#pk-list'),
    hits
      .slice(0, shown)
      .map((x) => m.render(x, selected))
      .join(''),
  );
  rove($('#pk-list'));
  // outside the listbox: a listbox holds options only
  $('#pk-more').innerHTML =
    hits.length > shown
      ? `<button type="button" class="btn more" data-more="1">Покажи още ${fmt(Math.min(PAGE, hits.length - shown))}</button>`
      : '';
}

// The listbox is one tab stop (WAI-ARIA APG): the option given, else the chosen one, else the first. Returns it.
function rove(list, to) {
  const options = [...list.children];
  const stop =
    to ?? options.find((o) => o.getAttribute('aria-selected') === 'true') ?? options[0] ?? null;
  for (const o of options) o.tabIndex = o === stop ? 0 : -1;
  return stop;
}

// Up/Down (and Left/Right, as the decors are laid out in a grid) move to the previous/next option, Home/End to
// the first/last; Enter or Space on an option picks it (it is a button).
const KEY_STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
function onListKey(ev) {
  const list = ev.currentTarget;
  const options = [...list.children];
  const i = options.indexOf(ev.target.closest('[role="option"]'));
  if (i < 0) return;
  let to;
  if (ev.key in KEY_STEP) to = Math.min(options.length - 1, Math.max(0, i + KEY_STEP[ev.key]));
  else if (ev.key === 'Home') to = 0;
  else if (ev.key === 'End') to = options.length - 1;
  else return;
  ev.preventDefault();
  rove(list, options[to])?.focus();
}

export function bindPicker() {
  $('#pk-q').addEventListener('input', (ev) => {
    if (!current) return;
    current.q = ev.target.value.trim().toLowerCase();
    current.shown = PAGE;
    draw();
  });
  // Enter (or Down) in the search goes to the results — the chosen one, else the first; it never closes the dialog
  $('#pk-q').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    rove($('#pk-list'))?.focus();
  });
  $('#pk-list').addEventListener('keydown', onListKey);
  dlg().addEventListener('click', (ev) => {
    if (!current) return;
    if (ev.target.closest('[data-close]')) {
      dlg().close();
      return;
    }
    // draw() replaces the chips and the list: the focus goes back to the pressed chip, or to the first new item
    const chip = ev.target.closest('[data-chip]');
    if (chip) {
      const { chip: name, v } = chip.dataset;
      current.st[name] = v;
      current.shown = PAGE;
      draw();
      $(`[data-chip="${CSS.escape(name)}"][data-v="${CSS.escape(v)}"]`, dlg())?.focus();
      return;
    }
    if (ev.target.closest('[data-more]')) {
      const before = current.shown;
      current.shown += PAGE;
      draw();
      rove($('#pk-list'), $('#pk-list').children[before])?.focus();
      return;
    }
    const item = ev.target.closest('[data-id]');
    if (item) {
      const { onPick } = current;
      dlg().close();
      onPick(item.dataset.id);
    }
  });
  dlg().addEventListener('close', () => {
    current = null;
  });
}
