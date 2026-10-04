// The editor's session with the server: the catalog (a failed load opens the project for reading only, instead of
// quietly swapping its hardware and decors for the base catalog's and saving that), downloads that wait for the save
// of what is on screen, and the question before leaving with work that is not saved yet.
import { baseCatalogData } from '../engine/catalog.js';
import { $, $$ } from './dom.js';

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

export function showError(message) {
  const box = $('#save-error');
  box.textContent = message;
  box.hidden = false;
}

export function lockForReading(message) {
  $('#params fieldset')?.setAttribute('disabled', '');
  $('#project-name')?.setAttribute('readonly', '');
  const button = $('#save');
  if (button) button.disabled = true;
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
