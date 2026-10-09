// Korpora editor: a saved project in the browser. Spec → model → BOM, drilling, nesting, drawings, CNC preview.
// The server keeps the spec (save) and makes the downloads from the SAVED spec; the preview here is computed live.
import { registerCatalog } from '../engine/catalog.js';
import { buildModel, normalizeSpec, withType } from '../engine/model.js';
import { buildBom } from '../engine/bom.js';
import { nest } from '../engine/nest.js';
import { cncBlockers } from '../engine/cam.js';
import { canonicalJson } from '../engine/util.js';
import { $, $$, sha256, localDate } from './dom.js';
import {
  renderTypes,
  renderParams,
  showType,
  bindTypebox,
  renderHardwareOptions,
  writeForm,
  bindForm,
  bindRailbox,
} from './form.js';
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
import { bindMenus } from './menus.js';
import { createSaver } from './saver.js';
import {
  loadCatalog,
  driftOf,
  showDrift,
  lockForReading,
  showError,
  bindDownloads,
  showDownloads,
  guardLeaving,
} from './session.js';
import { renderHeader } from './header.js';
import { TABS, showTab, bindTabs, followHash } from './tabs.js';

const boot = JSON.parse($('#boot').textContent);
const root = $('#main');
const csrf = root.dataset.csrf;
// also when the catalog does not load or the engine cannot build the project on opening (lockForReadingOnce)
let readOnly = boot.readOnly === true;
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
  drift: [], // hardware and decors of the saved project that have left the catalog, until it is saved
};
let viewer = null;
let CATALOG = null;

const meta = () => ({
  product: 'Korpora',
  hash: state.hash,
  owner: boot.owner,
  date: localDate(),
});

const RENDER = {
  view: () => viewer?.setModel(state.model),
  bom: () => renderBom(state),
  drill: () => renderDrill(state, meta()),
  nest: () => renderNesting(state, text.fullscreen),
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
  onSaved: () => {
    showDrift([]);
    void recompute();
  },
});

/* ---------- model ---------- */

// Never rejects: an engine error undoes the value, a failure to show the result is reported; callers use `void`.
let seq = 0;
async function recompute(writeFocused = false) {
  const mine = ++seq;
  const spec = state.spec;
  let model;
  let nesting;
  let bom;
  let blockers;
  try {
    model = buildModel(spec);
    // as on the server: the saved project drills and cuts for what it chose, not for the substitute on screen
    for (const reason of state.drift) model.warnings.push({ level: 'error', text: reason });
    nesting = nest(model);
    bom = buildBom(model);
    blockers = cncBlockers(model, nesting);
  } catch {
    // a first load has nothing to fall back to: the project opens for reading only (no value was changed)
    if (!state.model) {
      lockForReadingOnce(text.openFailed);
      return;
    }
    // a value the engine cannot build is undone, so it is never saved
    showError(text.engineFailed);
    state.spec = state.model.spec;
    writeForm(form, state.spec, true);
    return;
  }
  try {
    const hash = await sha256(canonicalJson(model.spec));
    // a newer recompute, or an edit made while the hash was computed (its own recompute follows), wins
    if (mine !== seq || state.spec !== spec) return;
    Object.assign(state, { spec: model.spec, model, hash, bom, nesting, blockers });
    writeForm(form, model.spec, writeFocused);
    renderHeader(state.model);
    showDownloads(state.blockers.length > 0, text.cncBlockedLink);
    for (const t of TABS) if (t !== 'cat') state.dirty.add(t);
    renderTab(state.tab);
  } catch {
    showError(text.showFailed);
  } finally {
    showState();
  }
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
  showTab(id, focus);
  if (id !== 'cnc') stopSim();
  renderTab(id);
  if (id === 'view') viewer?.resize();
}

function bindUi() {
  renderTypes($('#type-picker'));
  renderParams($('#param-fields'), state.spec.type);
  showType(state.spec.type);
  renderHardwareOptions();
  bindRailbox($('.railbox', form));
  bindTypebox($('.typebox', form));
  bindForm(form, (key, value, commit) => {
    if (readOnly) return;
    if (key === 'type') {
      state.spec = withType(state.spec, value);
      renderParams($('#param-fields'), value);
      showType(value);
      void recompute(true);
      return;
    }
    state.spec = { ...state.spec, [key]: value };
    // a final change shows the value as the engine took it (limits, step), also in a field still focused (Enter)
    if (commit) schedule(40, true);
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
        void recompute();
      });
    });
  }
  bindPicker();
  $('#reset').addEventListener('click', () => {
    if (readOnly) return;
    state.spec = normalizeSpec({ type: state.spec.type });
    void recompute(true);
  });

  bindTabs(selectTab);

  bindPanels(state, meta);
  bindCatalog(CATALOG);

  // 3D, and full screen for it and the drawings
  viewer = createViewer(text);
  bindFullscreens(text);

  // saving and downloads
  if (!readOnly) {
    $('#save').addEventListener('click', () => void save(true));
    $('#project-name').addEventListener('input', showState);
    document.addEventListener('keydown', (ev) => {
      // S by its letter, or by its place when the layout puts no Latin letter there (Cyrillic „с“)
      const s = ev.key.toLowerCase() === 's' || (ev.code === 'KeyS' && !/^[a-z]$/i.test(ev.key));
      if ((ev.ctrlKey || ev.metaKey) && s) {
        ev.preventDefault();
        void save(true);
      }
    });
    // a change still waiting for its recompute counts too
    guardLeaving(() => isDirty() || pending !== null || state.saving);
  }
  bindDownloads({ save, onBlocked: () => selectTab('cnc', true) });
  bindMenus($$('.ed-actions details'));
}

let locked = false;
function lockForReadingOnce(message) {
  if (locked) return;
  locked = true;
  readOnly = true;
  lockForReading(message, text.readOnlyState);
}

/* ---------- boot ---------- */

async function start() {
  const catalog = await loadCatalog();
  CATALOG = registerCatalog(catalog.data);
  state.spec = normalizeSpec(boot.spec ?? { type: 'base' });
  // a catalog that did not load is not a change of the catalog: that project opens for reading only
  if (catalog.ok) state.drift = driftOf(boot.spec, state.spec);
  bindUi();
  if (!catalog.ok && !readOnly) lockForReadingOnce(text.catalogFailed);
  showDrift(state.drift, { title: text.driftTitle, text: text.driftText });
  writeForm(form, state.spec, true);
  followHash(selectTab, () => state.tab);
  await recompute(true);
  // what was just loaded counts as saved, even if this browser's catalog normalizes it slightly differently
  state.savedHash = state.hash;
  showState();
}

start().catch(() => lockForReadingOnce(text.showFailed));
