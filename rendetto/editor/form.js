// The parameter rail: furniture type cards, schema-driven size fields, materials and colours, hardware and
// machine settings. Every control carries data-field; the rail reports changes and the pipeline re-normalizes.
import { TYPES, TYPE_ORDER } from '../engine/types.js';
import { decor, decorName, ralList } from '../engine/materials.js';
import {
  hingeList,
  slideList,
  bedFittingList,
  handleModel,
  hingeSystemOf,
} from '../engine/hardware.js';
import { SHELF_LOADS } from '../engine/model.js';
import { $, $$, esc, money, swatchStyle, setHtml } from './dom.js';
import { typeIcon, handleIcon } from './icons.js';

export function renderTypes(host) {
  const groups = [...new Set(TYPE_ORDER.map((t) => TYPES[t].group))];
  host.innerHTML = groups
    .map(
      (g) =>
        `<p class="tgroup">${esc(g)}</p><div class="types">${TYPE_ORDER.filter(
          (t) => TYPES[t].group === g,
        )
          .map(
            (t) =>
              `<label class="tcard"><input type="radio" name="type" value="${t}" data-field="type"><span>${typeIcon(t)}<b>${esc(TYPES[t].label)}</b></span></label>`,
          )
          .join('')}</div>`,
    )
    .join('');
}

// Fields of the current type: ranges as number + slider, segments as radio buttons.
export function renderParams(host, type) {
  host.innerHTML = TYPES[type].params
    .map((p) => {
      if (p.type === 'range') {
        const unit = p.unit ? `, ${p.unit}` : '';
        return `<div class="field"><label for="p-${p.key}">${esc(p.label)}${unit}</label>
<input type="number" id="p-${p.key}" data-field="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" inputmode="numeric">
<input type="range" data-field="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" aria-label="${esc(p.label)}, плъзгач"></div>`;
      }
      return `<span class="lbl" id="l-${p.key}">${esc(p.label)}</span><div class="seg" role="radiogroup" aria-labelledby="l-${p.key}">${p.options
        .map(
          ([v, l]) =>
            `<label><input type="radio" name="${p.key}" value="${v}" data-field="${p.key}"><span>${esc(l)}</span></label>`,
        )
        .join('')}</div>`;
    })
    .join('');
}

export function renderHardwareOptions() {
  const hinges = hingeList();
  const from = (list) => {
    const ps = list.filter((p) => p && Number.isFinite(p.price));
    if (!ps.length) return '';
    const min = ps.reduce((a, p) => (p.price < a.price ? p : a));
    return ` · от ${money(min.price, min.currency)}`;
  };
  $('#f-hinge').innerHTML = hinges.length
    ? groupOptions(
        hinges,
        (h) => hingeSystemOf(h)?.name ?? h.brand ?? 'Панти',
        (h) => `${h.name}${from(Object.values(h.variants ?? {}))}`,
      )
    : '<option value="">Няма панти с данни за пробиване</option>';
  const slides = slideList();
  $('#f-slide').innerHTML = slides.length
    ? slides
        .map(
          (s) =>
            `<option value="${esc(s.id)}">${esc(`${s.name}${from(Object.values(s.products ?? {}))}`)}</option>`,
        )
        .join('')
    : '<option value="">Няма водачи с данни за пробиване</option>';
  const fits = bedFittingList();
  $('#f-bedFitting').innerHTML = fits.length
    ? fits
        .map(
          (b) =>
            `<option value="${esc(b.id)}">${esc(`${b.brand ?? ''} ${b.sku ?? ''} — ${b.name}${Number.isFinite(b.price) ? ` · ${money(b.price, b.currency)}` : ''}`)}</option>`,
        )
        .join('')
    : '<option value="">Няма връзки в каталога</option>';
  $('#f-shelfLoad').innerHTML = SHELF_LOADS.map(
    (v) =>
      `<label><input type="radio" name="shelfLoad" value="${v}" data-field="shelfLoad"><span>${String(v).replace('.', ',')} kg/dm²</span></label>`,
  ).join('');
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
    out.textContent = `${String(v).replace('.', ',')}${out.dataset.unit ? ` ${out.dataset.unit}` : ''}`;
  }
  const ral = spec.frontMaterial === 'ral';
  $('#row-frontDecor').hidden = ral;
  $('#row-frontRal').hidden = !ral;
  $('#row-bedFitting').hidden = spec.type !== 'bed';
  $('#f-frontMaterial-ral').disabled = !ralList().length;
  pickButton('carcassDecor', decor(spec.carcassDecor), decorName(spec.carcassDecor));
  pickButton('frontDecor', decor(spec.frontDecor), decorName(spec.frontDecor));
  if (spec.frontRal)
    pickButton('frontRal', decor(spec.frontRal), `${spec.frontRal} — ${decor(spec.frontRal).name}`);
  const h = handleModel(spec.handle);
  const hb = $('[data-pick="handle"]');
  hb.innerHTML = h
    ? `${handleIcon(h)}<span class="pv">${esc(h.name)}<small>${esc([h.brand, h.holes === 2 && h.spacing ? `${h.spacing} mm` : h.holes === 1 ? '1 отвор' : '', money(h.price, h.currency)].filter(Boolean).join(' · '))}</small></span>`
    : `${handleIcon(null)}<span class="pv">Без дръжка<small>фронтовете се отварят с TIP-ON или профил — не е включен</small></span>`;
}

function pickButton(key, d, label) {
  const b = $(`[data-pick="${key}"]`);
  if (!b) return;
  setHtml(
    b,
    `<i class="sw" data-css="${esc(swatchStyle(d))}"></i><span class="pv">${esc(label)}<small>${esc(d.category === 'paint' ? 'МДФ, боядисан' : `${d.manufacturer}${d.code && d.manufacturer !== 'Основни' ? ` · ${d.code}` : ''}`)}</small></span>`,
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
