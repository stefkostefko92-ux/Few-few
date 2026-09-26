// Page entry: boots the 3D view and hands its API to the interface.
import { boot } from './render/main.js';
import { createUI } from './ui/ui.js';
import { strings, pickLang } from './ui/i18n.js';

// Inside the frame on the site's home page only the view shows: the page around it has the rest.
if (new URLSearchParams(location.search).has('embed')) document.documentElement.classList.add('embed');

// The baked textures sit next to the bundle, wherever the page that loads it lives.
boot({ canvas: document.getElementById('view'), texBase: new URL('tex/', import.meta.url).href })
  .then((api) => {
    window.panev3d = api;
    createUI(api);
    document.documentElement.dataset.ready = '1';
  })
  .catch((err) => {
    const box = document.getElementById('fatal');
    document.getElementById('loading').hidden = true;
    box.hidden = false;
    const detail = err instanceof Error ? err.message : String(err);
    box.querySelector('p').textContent = `${strings(pickLang()).fatal} (${detail})`;
    document.documentElement.dataset.ready = 'error';
  });
