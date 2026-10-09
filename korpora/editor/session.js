// The editor's session with the server: the catalog (a failed load opens the project for reading only, instead of
// quietly swapping its hardware and decors for the base catalog's and saving that), the notice about hardware and
// decors that have left it, downloads that wait for the save of what is on screen, and the question before leaving
// with work that is not saved yet.
import { baseCatalogData } from '../engine/catalog.js';
import { buildModel, catalogDrift } from '../engine/model.js';
import { $, $$, esc } from './dom.js';

// A request with no answer at all is given up after this long; a slow but running download of the body is not cut.
const ANSWER_TIMEOUT_MS = 20000;

export async function loadCatalog() {
  for (let attempt = 0; attempt < 2; attempt++) {
    const abort = new AbortController();
    const timer = window.setTimeout(() => abort.abort(), ANSWER_TIMEOUT_MS);
    try {
      const res = await fetch('/app/catalog.json', {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal: abort.signal,
      });
      window.clearTimeout(timer);
      if (res.ok) return { data: await res.json(), ok: true };
    } catch {
      window.clearTimeout(timer);
      // one more try, then the base catalog for reading only
    }
  }
  return { data: baseCatalogData(), ok: false };
}

// Catalog choices of the saved project that the editor had to replace (the reasons the server gives when it refuses
// CNC for the saved project). An engine error is left to the first recompute, which reports it.
export function driftOf(saved, spec) {
  try {
    return catalogDrift(saved ?? {}, buildModel(spec));
  } catch {
    return [];
  }
}

// A warning that does not block editing: what has left the catalog, its substitute on screen, and why the CNC files
// stay withheld until the project is saved. No reasons removes it.
export function showDrift(reasons, { title, text } = {}) {
  let box = $('#drift');
  if (!reasons.length) {
    box?.remove();
    return;
  }
  if (!box) {
    box = document.createElement('section');
    box.id = 'drift';
    box.className = 'notice notice-warn ed-notice';
    box.setAttribute('role', 'status');
    $('#save-error').before(box);
  }
  const items = reasons.map((r) => `<li>${esc(r)}</li>`).join('');
  box.innerHTML = `<svg class="i" aria-hidden="true" focusable="false"><use href="#i-alert"/></svg><div><h2>${esc(title)}</h2><p>${esc(text)}</p><ul>${items}</ul></div>`;
}

export function showError(message) {
  const box = $('#save-error');
  box.textContent = message;
  box.hidden = false;
}

// The state label says so too: from here on the saver no longer updates it, so „Saved“ would stay next to the
// disabled Save button.
export function lockForReading(message, stateLabel) {
  $('#params fieldset')?.setAttribute('disabled', '');
  $('#project-name')?.setAttribute('readonly', '');
  const button = $('#save');
  if (button) button.disabled = true;
  const label = $('#save-state');
  if (label && stateLabel) {
    label.textContent = stateLabel;
    label.dataset.state = 'readonly';
  }
  showError(message);
}

// Every download is made by the server from the SAVED project: what is on screen is saved first. While the checks
// find an error, the CNC download is withheld and leads to the reasons.
export function bindDownloads({ save, onBlocked }) {
  for (const a of $$('[data-export]')) {
    a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      a.closest('details')?.removeAttribute('open');
      if (a.getAttribute('aria-disabled') === 'true') {
        onBlocked();
        return;
      }
      if (await save()) location.href = a.href;
    });
  }
}

export function showDownloads(blocked, note) {
  for (const a of $$('[data-export="cnc"]')) {
    a.setAttribute('aria-disabled', String(blocked));
    if (blocked) a.title = note;
    else a.removeAttribute('title');
  }
}

export function guardLeaving(busy) {
  window.addEventListener('beforeunload', (ev) => {
    if (!busy()) return;
    ev.preventDefault();
    ev.returnValue = '';
  });
}
