// The page around the 3D view: the catalogue by family, the card of the part on show, the controls
// (hand, part/assembly, adjustment, light, zinc finish, auto-rotate, catalogue view, HD photo) and
// the language. The view is mirrored in the URL, so any view can be shared as a link.
import { CATALOG, FAMILIES } from '../catalog.js';
import { LANGS, strings, pickLang, itemName, INDICATIVE } from './i18n.js';
import { photoCanvas } from '../render/photo.js';

const $ = (id) => document.getElementById(id);
function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
const LANG_NAMES = { it: 'Italiano', en: 'English', bg: 'Български' };
const PHOTO = { width: 2048, height: 1536, frames: 32 };

// Section 06 (to shop drawing and wall fixing, pp. 61-62) is listed on its own, as on the site.
const groupOf = (item) => (item.page >= 61 ? 'special' : item.family);

export function createUI(api) {
  const autoLang = pickLang('');
  let lang = pickLang();
  let t = strings(lang);
  const buttons = new Map();
  // On the site every language has its own address: the switch is a set of links carrying the view.
  const langHrefs = JSON.parse(document.documentElement.dataset.langHrefs ?? 'null');

  function buildList() {
    buttons.clear();
    const sections = FAMILIES.map((fam) => {
      const ul = el('ul');
      for (const item of CATALOG.filter((i) => groupOf(i) === fam)) {
        const b = el('button', { type: 'button', textContent: item.code, title: itemName(item, t) });
        b.addEventListener('click', () => select(item.id));
        buttons.set(item.id, b);
        ul.append(el('li', {}, b));
      }
      return el('section', {}, el('h2', { textContent: t.families[fam] }), ul);
    });
    $('list').replaceChildren(...sections);
  }

  // Segmented control: `options` [value, label, disabledReason?]; the current value is pressed.
  function segment(label, options, current, onPick) {
    const g = el('div', { className: 'group seg' }, el('span', { textContent: label }));
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', label);
    for (const [value, text, off] of options) {
      const b = el('button', { type: 'button', textContent: text, disabled: Boolean(off), title: off || '' });
      b.setAttribute('aria-pressed', String(value === current));
      b.addEventListener('click', () => onPick(value));
      g.append(b);
    }
    return g;
  }

  function adjuster() {
    const asm = api.state.asm;
    if (!asm) return document.createDocumentFragment();
    const input = el('input', { type: 'range', id: 'adjust', min: asm.range[0], max: asm.range[1], step: asm.step, value: asm.value });
    const out = el('output');
    out.setAttribute('for', 'adjust');
    const fmt = (v) => (asm.unit === '°' ? `${Number(v).toFixed(1)}°` : `${Math.round(v)} mm`);
    out.value = fmt(asm.value);
    input.addEventListener('input', () => {
      out.value = fmt(api.adjust(input.value));
      updateURL();
    });
    return el('div', { className: 'group adj' }, el('label', { htmlFor: 'adjust', textContent: t.adjust[asm.kind] }), input, out);
  }

  function actions() {
    const rot = el('button', { type: 'button', className: 'act', textContent: t.rotate });
    rot.setAttribute('aria-pressed', String(api.controls.autoRotate));
    rot.addEventListener('click', () => {
      api.controls.autoRotate = !api.controls.autoRotate;
      rot.setAttribute('aria-pressed', String(api.controls.autoRotate));
      api.wake();
    });
    const reset = el('button', { type: 'button', className: 'act', textContent: t.reset });
    reset.addEventListener('click', () => select(api.state.item.id));
    const photo = el('button', { type: 'button', className: 'act primary', textContent: t.photo });
    photo.addEventListener('click', () => takePhoto(photo));
    return el('div', { className: 'group' }, rot, reset, photo);
  }

  function renderTools() {
    const s = api.state;
    const paired = Boolean(api.partnerOf(s.item));
    $('tools').replaceChildren(
      segment(t.hand, [['DX', t.hands.DX], ['SX', t.hands.SX]], s.hand, (v) => select(s.item.id, { hand: v })),
      segment(t.mode, [['part', t.modes.part], ['assembly', t.modes.assembly, paired ? '' : t.noPartner]], s.asm ? 'assembly' : 'part', (v) => select(s.item.id, { mode: v })),
      adjuster(),
      segment(t.look, [['studio', t.looks.studio], ['night', t.looks.night]], api.look, (v) => {
        api.setLook(v);
        sync();
      }),
      segment(t.finish, [['electro', t.finishes.electro], ['hotdip', t.finishes.hotdip]], api.finish, (v) => {
        api.setFinish(v);
        sync();
      }),
      actions(),
    );
  }

  function updateURL() {
    const s = api.state;
    const q = new URLSearchParams(location.search);
    const put = (k, v, def) => (v === def ? q.delete(k) : q.set(k, v));
    put('code', s.item.id, null);
    put('hand', s.hand, 'DX');
    put('mode', s.mode, 'part');
    put('look', api.look, 'studio');
    put('lang', lang, autoLang);
    history.replaceState(null, '', `${location.pathname}?${q}`);
    for (const a of $('langs').querySelectorAll('a')) a.search = q.toString();
  }

  // Scrolls the side list (desktop) to the current code; the stacked mobile list is left alone.
  function reveal(b) {
    const list = $('list');
    if (!b || getComputedStyle(list).overflowY !== 'auto') return;
    const r = b.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    if (r.top < l.top) list.scrollTop -= l.top - r.top + 8;
    else if (r.bottom > l.bottom) list.scrollTop += r.bottom - l.bottom + 8;
  }

  function sync() {
    const s = api.state;
    for (const [id, b] of buttons) b.setAttribute('aria-current', String(id === s.item.id));
    reveal(buttons.get(s.item.id));
    const partner = api.partnerOf(s.item);
    const name = itemName(s.item, t);
    $('code').textContent = s.asm && partner ? `${s.item.code} + ${partner.code}` : s.item.code;
    $('name').textContent = name;
    $('meta').textContent = `${t.thickness} ${s.item.t} mm · ${t.page} ${s.item.page}`;
    const p = $('partner');
    p.hidden = !partner;
    if (partner) {
      p.querySelector('span').textContent = `${t.partner}:`;
      const b = p.querySelector('button');
      b.textContent = partner.code;
      b.title = itemName(partner, t);
      b.onclick = () => select(partner.id);
    }
    $('warn').hidden = !INDICATIVE.has(s.item.code);
    $('warn').textContent = t.indicative;
    $('view').setAttribute('aria-label', t.canvas(`${s.item.code}, ${name}`));
    renderTools();
    updateURL();
  }

  function select(id, opts = {}) {
    api.show(id, opts);
    sync();
  }

  async function takePhoto(button) {
    const busy = $('busy');
    const frozen = [$('list'), $('tools'), $('info')];
    frozen.forEach((e) => (e.inert = true));
    button.disabled = true;
    busy.textContent = t.developing;
    busy.hidden = false;
    try {
      const shot = await api.photo(PHOTO);
      const canvas = photoCanvas(shot, api.backend !== 'WebGPU');
      const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
      const s = api.state;
      const a = el('a', { href: URL.createObjectURL(blob), download: `panev-${s.item.id}-${s.hand}${s.asm ? '-assembly' : ''}.png` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      busy.hidden = true;
    } catch (err) {
      busy.textContent = err instanceof Error ? err.message : String(err);
      setTimeout(() => {
        busy.hidden = true;
      }, 5000);
    } finally {
      frozen.forEach((e) => (e.inert = false));
      button.disabled = false;
    }
  }

  function setLang(l) {
    lang = l;
    t = strings(l);
    document.documentElement.lang = l;
    // A site page's head is already in its language (and longer, for search): leave it as it is.
    if (!langHrefs) {
      document.title = t.title;
      document.querySelector('meta[name="description"]')?.setAttribute('content', t.description);
    }
    $('title').textContent = t.title;
    $('list').setAttribute('aria-label', t.catalog);
    $('tools').setAttribute('aria-label', t.controls);
    $('langs').setAttribute('aria-label', t.language);
    $('hint').textContent = t.hint;
    $('note').textContent = t.note;
    for (const b of $('langs').children) {
      if (!langHrefs) b.setAttribute('aria-pressed', String(b.dataset.lang === l));
      else if (b.dataset.lang === l) b.setAttribute('aria-current', 'page');
    }
    buildList();
    sync();
  }

  $('langs').replaceChildren(
    ...LANGS.map((l) => {
      const props = { textContent: l.toUpperCase(), lang: l, title: LANG_NAMES[l] };
      const b = langHrefs ? el('a', { ...props, href: langHrefs[l], hreflang: l }) : el('button', { ...props, type: 'button' });
      b.dataset.lang = l;
      b.setAttribute('aria-label', LANG_NAMES[l]);
      if (!langHrefs) b.addEventListener('click', () => setLang(l));
      return b;
    }),
  );
  api.controls.listenToKeyEvents($('view'));
  setLang(lang);
  $('loading').hidden = true;
}
