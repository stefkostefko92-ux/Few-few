// Page entry: boots the 3D view and hands its API to the interface.
import { boot } from './render/main.js';
import { createUI } from './ui/ui.js';
import { strings, pickLang } from './ui/i18n.js';

boot({ canvas: document.getElementById('view') })
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
