// Page entry: boots the 3D view and hands its API to the interface.
import { boot } from './render/main.js';
import { createUI } from './ui/ui.js';
import { strings, pickLang } from './ui/i18n.js';

// The markup starts as <html class="booting">: until the view is up, the panels the interface fills
// stay invisible, so nothing on screen jumps as they fill (on phones they stack under the view). The
// class is in the markup, not set here, because on a slow connection this module arrives seconds
// after the first paint. The frame on the site's home page is its own document with class "embed".
const booted = (state) => {
  document.documentElement.classList.remove('booting');
  document.documentElement.dataset.ready = state;
};

// The baked textures sit next to the bundle, wherever the page that loads it lives.
boot({ canvas: document.getElementById('view'), texBase: new URL('tex/', import.meta.url).href })
  .then((api) => {
    window.panev3d = api;
    createUI(api);
    booted('1');
  })
  .catch((err) => {
    const box = document.getElementById('fatal');
    document.getElementById('loading').hidden = true;
    box.hidden = false;
    const detail = err instanceof Error ? err.message : String(err);
    box.querySelector('p').textContent = `${strings(pickLang()).fatal} (${detail})`;
    booted('error');
  });
