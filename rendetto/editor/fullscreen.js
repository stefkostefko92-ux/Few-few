// Full screen for the 3D view and the drawings. The browser's Fullscreen API where an element can have it, otherwise
// (iPhone Safari) the same layout as a fixed layer over the page. The button and Escape leave it; one view at a time.
// A drawing on full screen can be zoomed and moved (panzoom.js); the zoom buttons show only there.
import { PanZoom, ZOOM_STEP } from './panzoom.js';

let active = null; // { host, overlay, button, pz }

const fsElement = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;

function request(el) {
  const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!req) return Promise.reject(new Error('no fullscreen'));
  return Promise.resolve(req.call(el, { navigationUI: 'hide' }));
}

function exitNative() {
  const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
  return Promise.resolve(exit?.call(document)).catch(() => {});
}

function setState(entry, on) {
  entry.host.classList.toggle('is-full', on);
  entry.host.classList.toggle('is-overlay', on && entry.overlay);
  document.documentElement.classList.toggle('fs-lock', on && entry.overlay);
  entry.button.setAttribute('aria-pressed', String(on));
  entry.pz?.enable(on);
}

function leave() {
  const entry = active;
  if (!entry) return Promise.resolve();
  if (!entry.overlay && fsElement() === entry.host) return exitNative(); // fullscreenchange finishes it
  active = null;
  setState(entry, false);
  return Promise.resolve();
}

async function enter(entry) {
  await leave();
  active = entry;
  entry.overlay = false;
  try {
    await request(entry.host);
    if (fsElement() !== entry.host) throw new Error('not granted');
  } catch {
    entry.overlay = true;
  }
  if (active === entry) setState(entry, true);
  // left again while the browser was still granting it (a quick second click): close what it granted
  else if (fsElement() === entry.host) void exitNative();
}

function onChange() {
  const entry = active;
  if (!entry || entry.overlay) return;
  if (fsElement() !== entry.host) {
    active = null;
    setState(entry, false);
  }
}
document.addEventListener('fullscreenchange', onChange);
document.addEventListener('webkitfullscreenchange', onChange);
// Escape leaves the overlay (the browser handles it for real full screen); an open dialog takes Escape first
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && active?.overlay && !document.querySelector('dialog[open]')) {
    ev.preventDefault();
    void leave();
  }
});

// The zoom buttons of a drawing: shown on full screen only (CSS), next to the full screen button.
function zoomBar(pz, text) {
  const bar = document.createElement('span');
  bar.className = 'zoombar';
  const make = (label, icon, act, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small';
    if (title) b.setAttribute('aria-label', title);
    b.innerHTML = `<svg class="i" aria-hidden="true" focusable="false"><use href="#i-${icon}"/></svg>`;
    if (label) b.append(document.createTextNode(label));
    b.addEventListener('click', act);
    return b;
  };
  bar.append(
    make('', 'minus', () => pz.zoomBy(1 / ZOOM_STEP), text.zoomOut),
    make('', 'plus', () => pz.zoomBy(ZOOM_STEP), text.zoomIn),
    make(text.zoomFit, 'fit', () => pz.fit()),
  );
  const hint = document.createElement('span');
  hint.className = 'zoomhint';
  hint.textContent = text.zoomHint ?? '';
  bar.append(hint);
  return bar;
}

// The state of one full screen button: `host` goes full screen; `box` (optional) holds the drawing that zooms.
function createEntry(button, host, box, text) {
  const entry = { host, button, overlay: false, pz: box ? new PanZoom(box) : null };
  if (entry.pz) button.after(zoomBar(entry.pz, text));
  return entry;
}

function bindFullscreen(button, host, box, text) {
  const entry = createEntry(button, host, box, text);
  button.addEventListener('click', () => {
    if (active === entry) void leave();
    else void enter(entry);
  });
}

// The buttons in the page (data-fs = the element that goes full screen, data-fs-zoom = the drawing inside it) and
// the per-sheet buttons of the nesting, which are redrawn with the sheets.
export function bindFullscreens(text) {
  for (const b of document.querySelectorAll('[data-fs]')) {
    const host = document.getElementById(b.dataset.fs);
    const box = b.dataset.fsZoom ? document.getElementById(b.dataset.fsZoom) : null;
    if (host) bindFullscreen(b, host, box, text);
  }
  const sheets = document.getElementById('nest-sheets');
  sheets?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-fs-sheet]');
    if (!b) return;
    const card = b.closest('.sheetcard');
    if (active?.host === card) {
      void leave();
      return;
    }
    // a nesting sheet: the card is redrawn with every change of the model, so its entry lives on the card
    const entry = card.fsEntry ?? (card.fsEntry = createEntry(b, card, card, text));
    void enter(entry);
  });
}
