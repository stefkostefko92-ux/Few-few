// Déjà — welcome страница при първа инсталация: какво правя, какво никога
// не правя и откъде ме командваш. Прозрачността е част от продукта.

import { applyI18n } from '../lib/i18n.js';
import { initAmbient } from '../lib/ambient.js';
import { send } from '../lib/msg.js';
import { mountBookmarkCard } from '../lib/bookmarks-ui.js';

applyI18n();
const ambient = initAmbient();

// Отметките: полза от първата минута, вместо празна памет за седмици.
// Мрежата отзад расте с всяка научена партида — паметта буквално се пълни.
let base = 0;
send('deja:stats')
  .then(({ pages }) => {
    base = pages;
    ambient.setMemories(pages);
  })
  .catch(() => {});
let lastDone = 0;
mountBookmarkCard(document.getElementById('bm'), {
  onProgress(status) {
    if (status?.state !== 'running' || !status.total) return;
    ambient.setMemories(base + status.done);
    if (status.done > lastDone) ambient.surface(3);
    lastDone = status.done;
  },
});

document.getElementById('open').addEventListener('click', () => {
  location.href = chrome.runtime.getURL('search.html');
});

document.getElementById('options').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

// при ъпдейт (welcome.html?update=<версия>) показваме бележката „какво е ново“
if (new URLSearchParams(location.search).has('update')) {
  document.getElementById('updated').hidden = false;
}
