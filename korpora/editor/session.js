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
  box.className = 'ed-error';
  box.textContent = message;
  box.hidden = false;
}

// A save the server refused, with the way out: a title, what happened to the work on screen and the actions — a
// button ({ label, run }) or a link that opens in a new tab ({ label, href }), so this tab keeps the work. Shown in
// the alert under the header, brought into view and focused (a download that waited for the save ends here too).
export function showProblem({ title, text, actions }) {
  const box = $('#save-error');
  box.className = 'notice notice-bad ed-notice ed-problem';
  box.innerHTML = `<svg class="i" aria-hidden="true" focusable="false"><use href="#i-alert"/></svg><div><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="acts"></div></div>`;
  const acts = $('.acts', box);
  actions.forEach((action, i) => {
    const el = document.createElement(action.href ? 'a' : 'button');
    el.className = `btn btn-small${i === 0 ? ' btn-primary' : ''}`;
    el.textContent = action.label;
    if (action.href) {
      el.href = action.href;
      el.target = '_blank';
      el.rel = 'noopener';
    } else {
      el.type = 'button';
      el.addEventListener('click', action.run);
    }
    acts.append(el);
  });
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest' });
  box.focus({ preventScroll: true });
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

// The seconds until the server takes downloads again (Retry-After, else the reset of the RateLimit header).
function retryAfter(res) {
  const after = Number(res.headers.get('retry-after'));
  if (after > 0) return Math.ceil(after);
  return Number(/reset=(\d+)/.exec(res.headers.get('ratelimit') ?? '')?.[1]) || 60;
}

// The name the server gives the file (Content-Disposition: filename* in UTF-8, else filename).
function fileName(header) {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header ?? '')?.[1];
  if (utf8) return decodeURIComponent(utf8);
  return /filename="([^"]+)"/i.exec(header ?? '')?.[1] ?? '';
}

// The file comes through fetch, so too many downloads in a minute is told here, beside the work, instead of an error
// page in place of the editor. Any other refusal (CNC withheld for the saved project) opens the server's page, which
// gives the reasons; no answer at all, or no file, falls back to the plain link.
async function download(href, text) {
  let res;
  try {
    res = await fetch(href, { credentials: 'same-origin' });
  } catch {
    location.href = href;
    return;
  }
  if (res.status === 429) {
    showError(text.tooManyDownloads.replace('{s}', String(retryAfter(res))));
    $('#save-error').scrollIntoView({ block: 'nearest' });
    return;
  }
  // not a file (signed out: the sign-in page): the plain link, as before
  if (!res.ok || res.redirected || !res.headers.get('content-disposition')) {
    location.href = href;
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = fileName(res.headers.get('content-disposition'));
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Every download is made by the server from the SAVED project: what is on screen is saved first. While the checks
// find an error, the CNC download is withheld and leads to the reasons.
export function bindDownloads({ save, onBlocked, text }) {
  for (const a of $$('[data-export]')) {
    a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      a.closest('details')?.removeAttribute('open');
      if (a.getAttribute('aria-disabled') === 'true') {
        onBlocked();
        return;
      }
      if (await save()) await download(a.href, text);
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
