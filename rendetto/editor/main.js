// Rendetto editor: a saved project in the browser. Spec → model → BOM, drilling, nesting, drawings, CNC preview.
// The server keeps the spec (save) and makes the downloads from the SAVED spec; the preview here is computed live.
import { registerCatalog } from '../engine/catalog.js';
import { buildModel, normalizeSpec, withType } from '../engine/model.js';
import { buildBom } from '../engine/bom.js';
import { nest } from '../engine/nest.js';
import { cncBlockers } from '../engine/cam.js';
import { canonicalJson } from '../engine/util.js';
import { $, $$, sha256 } from './dom.js';
import { renderTypes, renderParams, renderHardwareOptions, writeForm, bindForm } from './form.js';
import { openPicker, bindPicker } from './pickers.js';
import { renderBom } from './render-bom.js';
import { renderDrill } from './render-drill.js';
import { renderNesting } from './render-nest.js';
import { renderDrawing } from './render-draw.js';
import { renderCnc, stopSim } from './render-cnc.js';
import { bindPanels } from './bind-panels.js';
import { renderCatalog, bindCatalog } from './render-catalog.js';
import { createViewer } from './bind-view.js';
import { bindFullscreens } from './fullscreen.js';
import { createSaver } from './saver.js';
import {
  loadCatalog,
  lockForReading,
  showError,
  bindDownloads,
  showDownloads,
  guardLeaving,
} from './session.js';
import { renderHeader } from './header.js';

const TABS = ['view', 'bom', 'drill', 'nest', 'draw', 'cnc', 'cat'];
const boot = JSON.parse($('#boot').textContent);
const root = $('#main');
const csrf = root.dataset.csrf;
let readOnly = boot.readOnly === true; // also when the catalog fails to load (session.js)
const text = JSON.parse(root.dataset.text || '{}');

const form = $('#params');
const state = {
  spec: null,
  tab: 'view',
  sheet: 0,
  drawing: 'assembly',
  drillPart: null,
  progress: 1,
  dirty: new Set(TABS),
  savedHash: boot.hash,
  savedName: boot.name,
  savedAt: boot.updatedAt, // the version this editor opened: the server saves only over it
  saving: false,
  conflict: false,
  blockers: [],
};
let viewer = null;
let CATALOG = null;

const meta = () => ({
  product: 'Rendetto',
  hash: state.hash,
  owner: boot.owner,
  date: new Date().toISOString().slice(0, 10),
});

const RENDER = {
  view: () => viewer?.setModel(state.model),
  bom: () => renderBom(state),
  drill: () => renderDrill(state, meta()),
  nest: () => renderNesting(state),
  draw: () => renderDrawing(state, meta()),
  cnc: () => renderCnc(state, meta()),
  cat: () => renderCatalog(CATALOG),
};

function renderTab(id) {
  if (!state.model || !state.dirty.has(id)) return;
  state.dirty.delete(id);
  RENDER[id]();
}

/* ---------- saving ---------- */

// A change still waiting for its recompute is applied first, so Ctrl+S right after typing saves the new value.
const { isDirty, showState, save } = createSaver({
  state,
  boot,
  csrf,
  isReadOnly: () => readOnly,
  text,
  beforeSave: flushPending,
});

/* ---------- model ---------- */

let seq = 0;
async function recompute(writeFocused = false) {
  const mine = ++seq;
  let model;
  let nesting;
  try {
    model = buildModel(state.spec);
    nesting = nest(model);
  } catch {
    // a value the engine cannot build is undone, so it is never saved; a first load has nothing to fall back to
    showError(text.engineFailed);
    if (!state.model) lockForReadingOnce(text.engineFailed);
    else {
      state.spec = state.model.spec;
      writeForm(form, state.spec, true);
    }
    return;
  }
  const hash = await sha256(canonicalJson(model.spec));
  if (mine !== seq) return;
  Object.assign(state, {
    spec: model.spec,
    model,
    hash,
    bom: buildBom(model),
    nesting,
    blockers: cncBlockers(model, nesting),
  });
  writeForm(form, model.spec, writeFocused);
  renderHeader(state.model);
  showDownloads(state.blockers.length > 0, text.cncBlockedLink);
  for (const t of TABS) if (t !== 'cat') state.dirty.add(t);
  renderTab(state.tab);
  showState();
}

let timer = 0;
let pending = null;
function schedule(delay, writeFocused = false) {
  window.clearTimeout(timer);
  pending = writeFocused;
  timer = window.setTimeout(() => {
    pending = null;
    void recompute(writeFocused);
  }, delay);
}

async function flushPending() {
  if (pending === null) return;
  window.clearTimeout(timer);
  const writeFocused = pending;
  pending = null;
  await recompute(writeFocused);
}

/* ---------- tabs ---------- */

function selectTab(id, focus = false) {
  state.tab = id;
  for (const t of $$('[role="tab"]')) {
    const on = t.dataset.tab === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  }
  for (const p of $$('[role="tabpanel"]')) p.hidden = p.id !== `panel-${id}`;
  if (history.replaceState) history.replaceState(null, '', `#${id}`);
  if (id !== 'cnc') stopSim();
  renderTab(id);
  if (id === 'view') viewer?.resize();
}

function bindUi() {
  renderTypes($('#type-picker'));
  renderParams($('#param-fields'), state.spec.type);
  renderHardwareOptions();
  bindForm(form, (key, value, commit) => {
    if (readOnly) return;
    if (key === 'type') {
      state.spec = withType(state.spec, value);
      renderParams($('#param-fields'), value);
      recompute(true);
      return;
    }
    state.spec = { ...state.spec, [key]: value };
    if (commit) schedule(40);
    else schedule(400);
  });
  for (const b of $$('[data-pick]')) {
    b.addEventListener('click', () => {
      if (readOnly) return;
      const key = b.dataset.pick;
      const mode = key === 'frontRal' ? 'ral' : key === 'handle' ? 'handle' : 'decor';
      openPicker(mode, state.spec[key], (id) => {
        state.spec = {
          ...state.spec,
          [key]: id,
          ...(key === 'frontRal' ? { frontMaterial: 'ral' } : {}),
        };
        recompute();
      });
    });
  }
  bindPicker();
  $('#reset').addEventListener('click', () => {
    if (readOnly) return;
    state.spec = normalizeSpec({ type: state.spec.type });
    recompute(true);
  });

  for (const t of $$('[role="tab"]')) {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
    t.addEventListener('keydown', (ev) => {
      const i = TABS.indexOf(t.dataset.tab);
      if (ev.key === 'ArrowRight') selectTab(TABS[(i + 1) % TABS.length], true);
      else if (ev.key === 'ArrowLeft') selectTab(TABS[(i + TABS.length - 1) % TABS.length], true);
      else return;
      ev.preventDefault();
    });
  }

  bindPanels(state, meta);
  bindCatalog(CATALOG);

  // 3D, and full screen for it and the drawings
  viewer = createViewer(text);
  bindFullscreens(text);

  // saving and downloads
  if (!readOnly) {
    $('#save').addEventListener('click', () => void save());
    $('#project-name').addEventListener('input', showState);
    document.addEventListener('keydown', (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        void save();
      }
    });
    // a change still waiting for its recompute counts too
    guardLeaving(() => isDirty() || pending !== null || state.saving);
  }
  bindDownloads({ save, onBlocked: () => selectTab('cnc', true) });
}

let locked = false;
function lockForReadingOnce(message) {
  if (locked) return;
  locked = true;
  readOnly = true;
  lockForReading(message);
}

/* ---------- boot ---------- */

async function start() {
  const catalog = await loadCatalog();
  CATALOG = registerCatalog(catalog.data);
  state.spec = normalizeSpec(boot.spec ?? { type: 'base' });
  bindUi();
  if (!catalog.ok && !readOnly) lockForReadingOnce(text.catalogFailed);
  writeForm(form, state.spec, true);
  const tabOfHash = () => location.hash.replace('#', '');
  selectTab(TABS.includes(tabOfHash()) ? tabOfHash() : 'view');
  // a link or the address bar can change the tab later too (replaceState in selectTab fires no hashchange)
  window.addEventListener('hashchange', () => {
    if (TABS.includes(tabOfHash()) && tabOfHash() !== state.tab) selectTab(tabOfHash());
  });
  await recompute(true);
  // what was just loaded counts as saved, even if this browser's catalog normalizes it slightly differently
  state.savedHash = state.hash;
  showState();
}

void start();
