// The parameter rail: furniture type cards, schema-driven size fields, materials and colours, hardware and
// machine settings. Every control carries data-field; the rail reports changes and the pipeline re-normalizes.
import { LISTED_TYPES, TYPES, typeText } from '../engine/types.js';
import { decor, decorName, ralList, isBaseDecor } from '../engine/materials.js';
import {
  hingeList,
  slideList,
  bedFittingList,
  handleModel,
  handleHoles,
  hingeSystemOf,
} from '../engine/hardware.js';
import {
  SHELF_LOADS,
  BAND_CARCASS,
  BAND_FRONT,
  GAP_RANGE,
  TOOL_DIAMETERS,
} from '../engine/model.js';
import { STEP_DOWN_RANGE, MAX_FEED_RANGE } from '../engine/cam.js';
import { $, $$, esc, money, num, swatchStyle, setHtml } from './dom.js';
import { tx, words } from './text.js';
import { typeIcon, handleIcon } from './icons.js';
import { paramsHtml } from './params-html.js';

export function renderTypes(host) {
  const groups = [...new Set(LISTED_TYPES.map((t) => TYPES[t].group))];
  const t = words();
  host.innerHTML = groups
    .map(
      (g) =>
        `<p class="tgroup">${esc(tx(`group.${g}`))}</p><div class="types">${LISTED_TYPES.filter(
          (type) => TYPES[type].group === g,
        )
          .map(
            (type) =>
              `<label class="tcard"><input type="radio" name="type" value="${type}" data-field="type"><span>${typeIcon(type)}<b>${esc(typeText(type, t).label)}</b></span></label>`,
          )
          .join('')}</div>`,
    )
    .join('');
}

// Fields of the current type: ranges as number + slider, segments as radio buttons. The server has drawn them for
// the type the project opened with (data-type); they are drawn here again only for another type.
export function renderParams(host, type) {
  if (host.dataset.type === type && host.firstElementChild) return;
  host.innerHTML = paramsHtml(typeText(type, words()).params);
  host.dataset.type = type;
}

// The chosen type on the closed „Furniture“ panel: its icon and name (the server writes the name first).
export function showType(type) {
  $('#type-icon').innerHTML = typeIcon(type);
  $('#type-name').textContent = typeText(type, words()).label;
}

// The types are chosen once per project, so they stay folded under the chosen one. A click on a card folds them
// again; the arrow keys move through the cards and keep them open.
export function bindTypebox(box) {
  box.querySelector('#type-picker').addEventListener('click', (ev) => {
    if (ev.detail === 0 || !ev.target.closest('.tcard')) return;
    window.setTimeout(() => {
      box.open = false;
      box.querySelector(':scope > summary').focus();
    });
  });
}

export function renderHardwareOptions() {
  const hinges = hingeList();
  const from = (list) => {
    const ps = list.filter((p) => p && Number.isFinite(p.price));
    if (!ps.length) return '';
    const min = ps.reduce((a, p) => (p.price < a.price ? p : a));
    return ` · ${tx('from', { price: money(min.price, min.currency) })}`;
  };
  $('#f-hinge').innerHTML = hinges.length
    ? groupOptions(
        hinges,
        (h) => (hingeSystemOf(h) ? words().of(hingeSystemOf(h)) : (h.brand ?? tx('hinges'))),
        (h) => `${words().of(h)}${from(Object.values(h.variants ?? {}))}`,
      )
    : `<option value="">${esc(tx('noHinges'))}</option>`;
  const slides = slideList();
  $('#f-slide').innerHTML = slides.length
    ? slides
        .map(
          (s) =>
            `<option value="${esc(s.id)}">${esc(`${words().of(s)}${from(Object.values(s.products ?? {}))}`)}</option>`,
        )
        .join('')
    : `<option value="">${esc(tx('noSlides'))}</option>`;
  const fits = bedFittingList();
  $('#f-bedFitting').innerHTML = fits.length
    ? fits
        .map(
          (b) =>
            `<option value="${esc(b.id)}">${esc(`${b.brand ?? ''} ${b.sku ?? ''} — ${words().of(b)}${Number.isFinite(b.price) ? ` · ${money(b.price, b.currency)}` : ''}`)}</option>`,
        )
        .join('')
    : `<option value="">${esc(tx('noBedFittings'))}</option>`;
  $('#f-shelfLoad').innerHTML = SHELF_LOADS.map(
    (v) =>
      `<label><input type="radio" name="shelfLoad" value="${v}" data-field="shelfLoad"><span>${num(v)} kg/dm²</span></label>`,
  ).join('');
  // the values normalizeSpec accepts — the select can neither offer more nor miss one
  const mm = (v) => `${num(v)} mm`;
  const band = $('#f-bandCarcass');
  band.innerHTML = BAND_CARCASS.map(
    (v) => `<option value="${v}">${esc(v === 0 ? band.dataset.none : mm(v))}</option>`,
  ).join('');
  $('#f-bandFront').innerHTML = BAND_FRONT.map(
    (v) => `<option value="${v}">${mm(v)}</option>`,
  ).join('');
  $('#f-tool').innerHTML = TOOL_DIAMETERS.map(
    (v) => `<option value="${v}">Ø${mm(v)}</option>`,
  ).join('');
  const gap = $('#f-gap');
  gap.min = String(GAP_RANGE[0]);
  gap.max = String(GAP_RANGE[1]);
  // the GRBL limits of the machine: the ranges normalizeSpec keeps them in
  for (const [id, [min, max]] of [
    ['#f-grblStepDown', STEP_DOWN_RANGE],
    ['#f-grblMaxFeed', MAX_FEED_RANGE],
  ]) {
    $(id).min = String(min);
    $(id).max = String(max);
  }
}

function groupOptions(list, groupOf, labelOf) {
  const groups = new Map();
  for (const x of list) {
    const g = groupOf(x);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(x);
  }
  return [...groups]
    .map(
      ([g, xs]) =>
        `<optgroup label="${esc(g)}">${xs.map((x) => `<option value="${esc(x.id)}">${esc(labelOf(x))}</option>`).join('')}</optgroup>`,
    )
    .join('');
}

// Reflect the spec in every control; the focused number field keeps what the user is typing.
export function writeForm(form, spec, writeFocused = false) {
  for (const el of $$('[data-field]', form)) {
    if (!writeFocused && el === document.activeElement && el.type === 'number') continue;
    const v = spec[el.dataset.field];
    if (el.type === 'radio') el.checked = String(v) === el.value;
    else if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (v !== undefined && v !== null) el.value = String(v);
  }
  for (const out of $$('output[data-for]', form)) {
    const v = spec[out.dataset.for];
    out.textContent = `${num(v)}${out.dataset.unit ? ` ${out.dataset.unit}` : ''}`;
  }
  // the fields of another choice (a side wall of the kitchen): a screen reader hears what came and went, not the first time
  const changed = [];
  for (const el of $$('[data-when]', form)) {
    const [key, values] = el.dataset.when.split(':');
    const hidden = !values.split(',').includes(String(spec[key]));
    if (el.dataset.whenSeen && el.hidden !== hidden)
      changed.push(
        tx(hidden ? 'field.hidden' : 'field.shown', {
          label: el.querySelector('label')?.textContent ?? '',
        }),
      );
    el.hidden = hidden;
    el.dataset.whenSeen = '1';
  }
  if (changed.length) $('#param-when').textContent = `${changed.join('. ')}.`;
  const ral = spec.frontMaterial === 'ral';
  $('#row-frontDecor').hidden = ral;
  $('#row-frontRal').hidden = !ral;
  $('#row-bedFitting').hidden = spec.type !== 'bed';
  for (const id of ['#row-grblStepDown', '#row-grblMaxFeed']) $(id).hidden = spec.post !== 'grbl';
  $('#f-frontMaterial-ral').disabled = !ralList().length;
  pickButton('carcassDecor', decor(spec.carcassDecor), decorName(spec.carcassDecor, words()));
  pickButton('frontDecor', decor(spec.frontDecor), decorName(spec.frontDecor, words()));
  if (spec.frontRal)
    pickButton('frontRal', decor(spec.frontRal), `${spec.frontRal} — ${decor(spec.frontRal).name}`);
  const h = handleModel(spec.handle);
  const hb = $('[data-pick="handle"]');
  hb.innerHTML = h
    ? `${handleIcon(h)}<span class="pv">${esc(words().of(h))}<small>${esc([h.brand, handleHoles(h, words()).label, money(h.price, h.currency)].filter(Boolean).join(' · '))}</small></span>`
    : `${handleIcon(null)}<span class="pv">${esc(tx('handle.none'))}<small>${esc(tx('handle.noneFronts'))}</small></span>`;
}

function pickButton(key, d, label) {
  const b = $(`[data-pick="${key}"]`);
  if (!b) return;
  setHtml(
    b,
    `<i class="sw" data-css="${esc(swatchStyle(d))}"></i><span class="pv">${esc(label)}<small>${esc(d.category === 'paint' ? tx('paintedMdf') : `${d.manufacturer}${d.code && !isBaseDecor(d) ? ` · ${d.code}` : ''}`)}</small></span>`,
  );
}

// Wire the rail: every input reports { key, value, commit } — commit is true when the change is final.
export function bindForm(form, onField) {
  form.addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-field]');
    if (!el || (el.type === 'radio' && !el.checked)) return;
    const value = el.type === 'checkbox' ? el.checked : el.value;
    for (const twin of $$(`[data-field="${el.dataset.field}"]`, form))
      if (twin !== el && twin.type !== 'radio' && twin.type !== 'checkbox')
        twin.value = String(value);
    onField(el.dataset.field, value, el.type !== 'number');
  });
  form.addEventListener('change', (ev) => {
    if (ev.target.matches('input[type="number"]'))
      onField(ev.target.dataset.field, ev.target.value, true);
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());
}

// From 900 px the parameters are always open and their summary is a plain heading (10-rail.css): neither a key nor a
// click closes them there, and a panel closed on a narrower screen opens again when the screen widens.
export function bindRailbox(box) {
  const wide = window.matchMedia('(min-width: 900px)');
  const summary = box.querySelector(':scope > summary');
  summary.addEventListener('click', (ev) => {
    if (wide.matches) ev.preventDefault();
  });
  const sync = () => {
    if (wide.matches) box.open = true;
    summary.tabIndex = wide.matches ? -1 : 0;
  };
  wide.addEventListener('change', sync);
  sync();
}
