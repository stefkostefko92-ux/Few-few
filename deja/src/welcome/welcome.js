// Déjà — welcome страница при първа инсталация: какво правя, какво никога
// не правя и откъде ме командваш. Прозрачността е част от продукта.

import { applyI18n } from '../lib/i18n.js';

applyI18n();

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
